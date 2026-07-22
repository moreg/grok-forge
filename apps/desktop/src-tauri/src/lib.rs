use chrono::{DateTime, Utc};
use keyring;
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use std::collections::HashMap;
use std::env;
use std::fs;
use std::fs::OpenOptions;
use std::io::{BufRead, BufReader, Read, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Listener, Manager, State};

#[cfg(windows)]
use std::os::windows::process::CommandExt;

/// Hide console windows when spawning helper processes on Windows.
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

fn configure_command(cmd: &mut Command) -> &mut Command {
    #[cfg(windows)]
    {
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    cmd
}

#[derive(Default)]
struct GrokState {
    process: Mutex<Option<GrokProcess>>,
    workspace: Mutex<Option<PathBuf>>,
    account_id: Mutex<Option<String>>,
    credential_io: Mutex<()>,
    terminals: Mutex<HashMap<String, ManagedTerminal>>,
}

struct GrokProcess {
    child: Child,
    stdin: ChildStdin,
}

struct ManagedTerminal {
    child: Child,
    stdin: Option<ChildStdin>,
    output: Arc<Mutex<String>>,
    truncated: Arc<Mutex<bool>>,
    #[allow(dead_code)]
    output_byte_limit: usize,
    name: String,
    /// When true, stdin is piped and the UI may write input.
    interactive: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct BackendStatus {
    mode: &'static str,
    installed: bool,
    version: String,
    path: String,
    workspace_path: String,
}

#[derive(Serialize)]
struct ProcessStatus {
    running: bool,
    pid: Option<u32>,
    #[serde(rename = "accountId")]
    account_id: Option<String>,
}

const LEGACY_ACCOUNT_ID: &str = "legacy-default";
const LEGACY_MARKER_FILE: &str = ".legacy-global-auth";
const AUTH_SCOPE: &str = "https://accounts.x.ai/sign-in";

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct LegacyAccountResult {
    account_id: Option<String>,
    credential_exists: bool,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct CredentialInspection {
    exists: bool,
    renewal: &'static str,
    auth_status: &'static str,
    expires_at: Option<String>,
    account_label: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct CredentialImportResult {
    renewal: &'static str,
    auth_status: &'static str,
    expires_at: Option<String>,
    account_label: Option<String>,
}

#[derive(Deserialize)]
struct CredentialImportPackage {
    access_token: String,
    #[serde(default)]
    refresh_token: Option<String>,
    #[serde(default)]
    expires_at: Option<Value>,
    #[serde(default)]
    issuer: Option<String>,
    #[serde(default)]
    client_id: Option<String>,
    #[serde(default)]
    user_id: Option<String>,
    #[serde(default)]
    email: Option<String>,
}

fn validate_account_id(account_id: &str) -> Result<(), String> {
    let valid = account_id.len() >= 8
        && account_id.len() <= 80
        && account_id.starts_with("acc-")
        && account_id
            .bytes()
            .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'-');
    if valid {
        Ok(())
    } else {
        Err("账号 ID 格式无效。".to_string())
    }
}

fn app_accounts_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let app_data = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("无法解析应用数据目录：{error}"))?;
    fs::create_dir_all(&app_data).map_err(|error| format!("无法创建应用数据目录：{error}"))?;
    let app_data = app_data
        .canonicalize()
        .map_err(|error| format!("无法规范化应用数据目录：{error}"))?;
    let accounts = app_data.join("accounts");
    fs::create_dir_all(&accounts).map_err(|error| format!("无法创建账号目录：{error}"))?;
    let accounts = accounts
        .canonicalize()
        .map_err(|error| format!("无法规范化账号目录：{error}"))?;
    if !accounts.starts_with(&app_data) {
        return Err("账号目录不在应用数据目录内。".to_string());
    }
    Ok(accounts)
}

fn global_auth_path() -> Result<PathBuf, String> {
    env::var_os("USERPROFILE")
        .or_else(|| env::var_os("HOME"))
        .map(PathBuf::from)
        .map(|path| path.join(".grok").join("auth.json"))
        .ok_or_else(|| "无法解析用户目录。".to_string())
}

fn account_auth_path(app: &AppHandle, account_id: &str) -> Result<PathBuf, String> {
    let accounts_dir = app_accounts_dir(app)?;
    if account_id == LEGACY_ACCOUNT_ID {
        let marker = accounts_dir.join(LEGACY_MARKER_FILE);
        if !marker.is_file() {
            return Err("默认旧账号未由后端初始化。".to_string());
        }
        return global_auth_path();
    }
    validate_account_id(account_id)?;
    let account_dir = accounts_dir.join(account_id);
    fs::create_dir_all(&account_dir).map_err(|error| format!("无法创建账号认证目录：{error}"))?;
    let account_dir = account_dir
        .canonicalize()
        .map_err(|error| format!("无法规范化账号认证目录：{error}"))?;
    if !account_dir.starts_with(&accounts_dir) {
        return Err("账号认证路径越界。".to_string());
    }
    let auth_path = account_dir.join("auth.json");
    if let Ok(metadata) = fs::symlink_metadata(&auth_path) {
        if metadata.file_type().is_symlink() {
            return Err("拒绝使用符号链接认证文件。".to_string());
        }
        let canonical = auth_path
            .canonicalize()
            .map_err(|error| format!("无法规范化认证文件：{error}"))?;
        if !canonical.starts_with(&account_dir) {
            return Err("账号认证文件路径越界。".to_string());
        }
    }
    Ok(auth_path)
}

fn parse_expiry(value: Option<&Value>) -> Result<Option<DateTime<Utc>>, String> {
    match value {
        None | Some(Value::Null) => Ok(None),
        Some(Value::String(value)) => DateTime::parse_from_rfc3339(value)
            .map(|time| Some(time.with_timezone(&Utc)))
            .map_err(|_| "expires_at 必须是 RFC3339 时间。".to_string()),
        Some(Value::Number(value)) => value
            .as_i64()
            .and_then(|seconds| DateTime::from_timestamp(seconds, 0))
            .map(Some)
            .ok_or_else(|| "expires_at 时间戳无效。".to_string()),
        _ => Err("expires_at 格式无效。".to_string()),
    }
}

fn validate_issuer(issuer: &str) -> Result<(), String> {
    let parsed = url::Url::parse(issuer).map_err(|_| "issuer URL 无效。".to_string())?;
    let allowed = parsed.scheme() == "https"
        && parsed.username().is_empty()
        && parsed.password().is_none()
        && parsed.port().is_none()
        && matches!(parsed.host_str(), Some("auth.x.ai") | Some("accounts.x.ai"));
    if allowed {
        Ok(())
    } else {
        Err("issuer 必须是受信任的 xAI HTTPS 地址。".to_string())
    }
}

fn credential_to_auth_store(raw: &str) -> Result<(Value, CredentialImportResult), String> {
    let package: CredentialImportPackage = serde_json::from_str(raw)
        .map_err(|_| "凭据必须是包含明确字段的 JSON 对象。".to_string())?;
    let access_token = package.access_token.trim();
    if access_token.is_empty() {
        return Err("access_token 不能为空。".to_string());
    }
    let refresh_token = package
        .refresh_token
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty());
    let issuer = package
        .issuer
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty());
    let client_id = package
        .client_id
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty());
    let expires_at = parse_expiry(package.expires_at.as_ref())?;
    let refreshable =
        refresh_token.is_some() && issuer.is_some() && client_id.is_some() && expires_at.is_some();
    if refresh_token.is_some() || issuer.is_some() || client_id.is_some() {
        if !refreshable {
            return Err(
                "OIDC 导入包缺少 refresh_token、expires_at、issuer 或 client_id。".to_string(),
            );
        }
        validate_issuer(issuer.expect("checked above"))?;
    }

    let now = Utc::now();
    let label = package
        .email
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_owned)
        .or_else(|| {
            package
                .user_id
                .as_deref()
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(str::to_owned)
        });
    let mut auth = Map::new();
    auth.insert("key".into(), Value::String(access_token.to_string()));
    auth.insert("auth_mode".into(), Value::String("oidc".into()));
    auth.insert("create_time".into(), Value::String(now.to_rfc3339()));
    auth.insert(
        "user_id".into(),
        Value::String(package.user_id.unwrap_or_default()),
    );
    auth.insert(
        "email".into(),
        package.email.map(Value::String).unwrap_or(Value::Null),
    );
    if let Some(value) = refresh_token {
        auth.insert("refresh_token".into(), Value::String(value.to_string()));
    }
    if let Some(value) = expires_at {
        auth.insert("expires_at".into(), Value::String(value.to_rfc3339()));
    }
    if let Some(value) = issuer {
        auth.insert("oidc_issuer".into(), Value::String(value.to_string()));
    }
    if let Some(value) = client_id {
        auth.insert("oidc_client_id".into(), Value::String(value.to_string()));
    }
    let mut store = Map::new();
    store.insert(AUTH_SCOPE.into(), Value::Object(auth));
    Ok((
        Value::Object(store),
        CredentialImportResult {
            renewal: if refreshable {
                "refreshable"
            } else {
                "non-refreshable"
            },
            auth_status: "valid",
            expires_at: expires_at.map(|value| value.to_rfc3339()),
            account_label: label,
        },
    ))
}

fn atomic_write_json(path: &Path, value: &Value) -> Result<(), String> {
    let parent = path
        .parent()
        .ok_or_else(|| "认证文件路径无效。".to_string())?;
    fs::create_dir_all(parent).map_err(|error| format!("无法创建认证目录：{error}"))?;
    let temp = parent.join("auth.json.importing");
    let backup = parent.join("auth.json.import-backup");
    let bytes =
        serde_json::to_vec_pretty(value).map_err(|error| format!("无法序列化凭据：{error}"))?;
    let _ = fs::remove_file(&temp);
    let mut options = OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    let mut file = options
        .open(&temp)
        .map_err(|error| format!("无法创建临时认证文件：{error}"))?;
    file.write_all(&bytes)
        .map_err(|error| format!("无法写入临时认证文件：{error}"))?;
    file.sync_all()
        .map_err(|error| format!("无法同步临时认证文件：{error}"))?;
    let had_existing = path.exists();
    if had_existing {
        let _ = fs::remove_file(&backup);
        fs::rename(path, &backup).map_err(|error| format!("无法备份现有认证文件：{error}"))?;
    }
    if let Err(error) = fs::rename(&temp, path) {
        if had_existing {
            let _ = fs::rename(&backup, path);
        }
        let _ = fs::remove_file(&temp);
        return Err(format!("无法替换认证文件：{error}"));
    }
    if had_existing {
        let _ = fs::remove_file(&backup);
    }
    Ok(())
}

fn inspect_auth_file(path: &Path) -> Result<CredentialInspection, String> {
    if !path.is_file() {
        return Ok(CredentialInspection {
            exists: false,
            renewal: "unknown",
            auth_status: "relogin-required",
            expires_at: None,
            account_label: None,
        });
    }
    let raw = fs::read_to_string(path).map_err(|_| "无法读取账号凭据。".to_string())?;
    let root: Value = serde_json::from_str(&raw).map_err(|_| "账号凭据格式损坏。".to_string())?;
    let entry = root
        .as_object()
        .and_then(|store| {
            store.get(AUTH_SCOPE).or_else(|| {
                store
                    .values()
                    .find(|value| value.get("auth_mode").and_then(Value::as_str) != Some("api_key"))
            })
        })
        .and_then(Value::as_object);
    let Some(entry) = entry else {
        return Ok(CredentialInspection {
            exists: true,
            renewal: "non-refreshable",
            auth_status: "relogin-required",
            expires_at: None,
            account_label: None,
        });
    };
    let expires_at = entry
        .get("expires_at")
        .and_then(Value::as_str)
        .map(str::to_owned);
    let expiry = expires_at
        .as_deref()
        .and_then(|value| DateTime::parse_from_rfc3339(value).ok())
        .map(|value| value.with_timezone(&Utc));
    let refreshable = entry
        .get("refresh_token")
        .and_then(Value::as_str)
        .is_some_and(|value| !value.is_empty())
        && entry
            .get("oidc_issuer")
            .and_then(Value::as_str)
            .is_some_and(|value| validate_issuer(value).is_ok())
        && entry
            .get("oidc_client_id")
            .and_then(Value::as_str)
            .is_some_and(|value| !value.is_empty());
    let expired_without_refresh = expiry.is_some_and(|value| value <= Utc::now()) && !refreshable;
    let label = entry
        .get("email")
        .and_then(Value::as_str)
        .or_else(|| entry.get("user_id").and_then(Value::as_str))
        .filter(|value| !value.is_empty())
        .map(str::to_owned);
    Ok(CredentialInspection {
        exists: true,
        renewal: if refreshable {
            "refreshable"
        } else {
            "non-refreshable"
        },
        auth_status: if expired_without_refresh {
            "relogin-required"
        } else {
            "valid"
        },
        expires_at,
        account_label: label,
    })
}

fn can_finalize_keyring_migration(inspection: &CredentialInspection) -> bool {
    inspection.exists && inspection.auth_status == "valid"
}

fn delete_keyring_entry_if_present(entry: &keyring::Entry) -> Result<(), String> {
    match entry.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(_) => Err("凭据已迁移，但无法删除旧钥匙串副本。".to_string()),
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct TextContent {
    content: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct TerminalCreateResult {
    terminal_id: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct TerminalListItem {
    terminal_id: String,
    name: String,
    status: String,
    exit_code: Option<i32>,
    output: String,
    truncated: bool,
    interactive: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct TerminalOutputResult {
    output: String,
    truncated: bool,
    exit_status: Option<TerminalExitStatus>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct TerminalExitStatus {
    exit_code: Option<i32>,
    signal: Option<String>,
}

static TERMINAL_SEQ: AtomicU64 = AtomicU64::new(1);

fn grok_candidates() -> Vec<PathBuf> {
    let mut candidates = Vec::new();
    if let Ok(explicit) = env::var("GROK_BINARY") {
        if !explicit.trim().is_empty() {
            candidates.push(PathBuf::from(explicit));
        }
    }
    if let Ok(profile) = env::var("USERPROFILE") {
        candidates.push(
            PathBuf::from(profile)
                .join(".grok")
                .join("bin")
                .join("grok.exe"),
        );
    }
    candidates.push(PathBuf::from("grok"));
    candidates
}

fn resolve_grok_binary() -> Result<PathBuf, String> {
    grok_candidates()
        .into_iter()
        .find(|candidate| {
            candidate == Path::new("grok")
                || fs::metadata(candidate).is_ok_and(|meta| meta.is_file())
        })
        .ok_or_else(|| "找不到 grok 可执行文件，请先安装 Grok Build。".to_string())
}

fn validate_workspace(cwd: &str) -> Result<PathBuf, String> {
    if cwd.trim().is_empty() {
        return Err("工作区路径不能为空。".to_string());
    }
    let path = PathBuf::from(cwd);
    if !path.is_dir() {
        return Err(format!("工作区不存在或不是目录：{cwd}"));
    }
    Ok(path)
}

fn current_workspace(state: &State<'_, GrokState>) -> Result<PathBuf, String> {
    let guard = state
        .workspace
        .lock()
        .map_err(|_| "工作区状态不可用。".to_string())?;
    guard
        .clone()
        .ok_or_else(|| "尚未设置工作区，请先连接 Grok。".to_string())
}

fn resolve_within_workspace(
    path: &str,
    workspace: &Path,
    create_parents: bool,
) -> Result<PathBuf, String> {
    let candidate = {
        let raw = PathBuf::from(path);
        if raw.is_absolute() {
            raw
        } else {
            workspace.join(raw)
        }
    };

    let workspace_canon = workspace
        .canonicalize()
        .map_err(|error| format!("无法解析工作区路径：{error}"))?;

    if create_parents {
        if let Some(parent) = candidate.parent() {
            fs::create_dir_all(parent).map_err(|error| format!("无法创建目录：{error}"))?;
            let parent_canon = parent
                .canonicalize()
                .map_err(|error| format!("无法解析父目录：{error}"))?;
            if !parent_canon.starts_with(&workspace_canon) {
                return Err("拒绝写入工作区以外的路径。".to_string());
            }
        }
        return Ok(candidate);
    }

    let file_canon = candidate
        .canonicalize()
        .map_err(|error| format!("无法读取文件：{error}"))?;
    if !file_canon.starts_with(&workspace_canon) {
        return Err("拒绝读取工作区以外的路径。".to_string());
    }
    Ok(file_canon)
}

fn slice_lines(content: &str, line: Option<u32>, limit: Option<u32>) -> String {
    let lines: Vec<&str> = content.lines().collect();
    if lines.is_empty() {
        return content.to_string();
    }
    let start = line.unwrap_or(1).max(1) as usize;
    let start_idx = start.saturating_sub(1).min(lines.len());
    let end_idx = match limit {
        Some(count) if count > 0 => (start_idx + count as usize).min(lines.len()),
        _ => lines.len(),
    };
    if start_idx >= lines.len() {
        return String::new();
    }
    let mut out = lines[start_idx..end_idx].join("\n");
    if content.ends_with('\n') && end_idx == lines.len() {
        out.push('\n');
    }
    out
}

fn append_output(
    buffer: &Arc<Mutex<String>>,
    truncated: &Arc<Mutex<bool>>,
    chunk: &str,
    limit: usize,
) {
    if let Ok(mut output) = buffer.lock() {
        output.push_str(chunk);
        if output.len() > limit {
            let keep_from = output.len() - limit;
            let boundary = output
                .char_indices()
                .find(|(idx, _)| *idx >= keep_from)
                .map(|(idx, _)| idx)
                .unwrap_or(keep_from);
            *output = output[boundary..].to_string();
            if let Ok(mut flag) = truncated.lock() {
                *flag = true;
            }
        }
    }
}

fn pump_reader<R: Read + Send + 'static>(
    reader: R,
    buffer: Arc<Mutex<String>>,
    truncated: Arc<Mutex<bool>>,
    limit: usize,
    app: AppHandle,
    terminal_id: String,
) {
    thread::spawn(move || {
        let mut reader = BufReader::new(reader);
        let mut chunk = [0u8; 4096];
        loop {
            match reader.read(&mut chunk) {
                Ok(0) => break,
                Ok(n) => {
                    let text = String::from_utf8_lossy(&chunk[..n]).to_string();
                    append_output(&buffer, &truncated, &text, limit);
                    let _ = app.emit(
                        "grok://terminal-chunk",
                        serde_json::json!({
                            "terminalId": terminal_id,
                            "chunk": text,
                        }),
                    );
                }
                Err(_) => break,
            }
        }
        let _ = app.emit(
            "grok://terminal-exit",
            serde_json::json!({ "terminalId": terminal_id }),
        );
    });
}

fn child_exit_status(child: &mut Child) -> Result<Option<TerminalExitStatus>, String> {
    match child.try_wait().map_err(|error| error.to_string())? {
        Some(status) => Ok(Some(TerminalExitStatus {
            exit_code: status.code(),
            signal: None,
        })),
        None => Ok(None),
    }
}

#[tauri::command]
fn grok_status() -> Result<BackendStatus, String> {
    let binary = resolve_grok_binary()?;
    let mut cmd = Command::new(&binary);
    configure_command(&mut cmd);
    let output = cmd
        .arg("--version")
        .stdin(Stdio::null())
        .output()
        .map_err(|error| format!("无法启动 Grok：{error}"))?;

    let version = String::from_utf8_lossy(&output.stdout).trim().to_string();
    Ok(BackendStatus {
        mode: "native",
        installed: output.status.success(),
        version: if version.is_empty() {
            "Grok Build".into()
        } else {
            version
        },
        path: binary.to_string_lossy().into_owned(),
        workspace_path: env::current_dir()
            .map(|path| path.to_string_lossy().into_owned())
            .unwrap_or_default(),
    })
}

fn emit_json_lines<R: std::io::Read + Send + 'static>(
    reader: R,
    app: AppHandle,
    event: &'static str,
) {
    std::thread::spawn(move || {
        for line in BufReader::new(reader).lines().map_while(Result::ok) {
            let payload = serde_json::from_str::<Value>(&line)
                .unwrap_or_else(|_| serde_json::json!({ "raw": line }));
            let _ = app.emit(event, payload);
        }
    });
}

#[tauri::command]
fn start_grok(
    cwd: String,
    account_id: String,
    task_account_id: String,
    app: AppHandle,
    state: State<'_, GrokState>,
) -> Result<ProcessStatus, String> {
    let workspace = validate_workspace(&cwd)?;
    if task_account_id != account_id {
        return Err("任务归属账号与 Agent 账号不一致。".to_string());
    }
    let auth_path = account_auth_path(&app, &account_id)?;
    let mut guard = state
        .process
        .lock()
        .map_err(|_| "Grok 进程状态不可用。".to_string())?;

    if let Some(process) = guard.as_mut() {
        if process
            .child
            .try_wait()
            .map_err(|error| error.to_string())?
            .is_none()
        {
            let bound = state
                .account_id
                .lock()
                .map_err(|_| "账号绑定状态不可用。".to_string())?;
            if bound.as_deref() != Some(account_id.as_str()) {
                return Err("Grok Agent 已绑定其他账号，请先停止后再切换。".to_string());
            }
            *state
                .workspace
                .lock()
                .map_err(|_| "工作区状态不可用。".to_string())? = Some(workspace.clone());
            return Ok(ProcessStatus {
                running: true,
                pid: Some(process.child.id()),
                account_id: Some(account_id),
            });
        }
        *guard = None;
        *state
            .account_id
            .lock()
            .map_err(|_| "账号绑定状态不可用。".to_string())? = None;
    }

    let binary = resolve_grok_binary()?;
    let mut cmd = Command::new(binary);
    configure_command(&mut cmd);
    let mut child = cmd
        .args(["agent", "stdio"])
        .env("GROK_AUTH_PATH", &auth_path)
        .current_dir(&workspace)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| format!("启动 Grok Agent 失败：{error}"))?;

    let stdin = child
        .stdin
        .take()
        .ok_or_else(|| "无法连接 Grok stdin。".to_string())?;
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "无法连接 Grok stdout。".to_string())?;
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| "无法连接 Grok stderr。".to_string())?;
    let pid = child.id();

    emit_json_lines(stdout, app.clone(), "grok://message");
    emit_json_lines(stderr, app, "grok://stderr");
    *guard = Some(GrokProcess { child, stdin });
    *state
        .account_id
        .lock()
        .map_err(|_| "账号绑定状态不可用。".to_string())? = Some(account_id.clone());
    *state
        .workspace
        .lock()
        .map_err(|_| "工作区状态不可用。".to_string())? = Some(workspace);

    Ok(ProcessStatus {
        running: true,
        pid: Some(pid),
        account_id: Some(account_id),
    })
}

#[tauri::command]
fn send_grok_rpc(payload: Value, state: State<'_, GrokState>) -> Result<(), String> {
    let mut guard = state
        .process
        .lock()
        .map_err(|_| "Grok 进程状态不可用。".to_string())?;
    let process = guard
        .as_mut()
        .ok_or_else(|| "Grok Agent 尚未启动。".to_string())?;
    let mut line = serde_json::to_vec(&payload).map_err(|error| error.to_string())?;
    line.push(b'\n');
    process
        .stdin
        .write_all(&line)
        .map_err(|error| format!("发送 ACP 消息失败：{error}"))?;
    process
        .stdin
        .flush()
        .map_err(|error| format!("刷新 ACP 消息失败：{error}"))
}

#[tauri::command]
fn stop_grok(state: State<'_, GrokState>) -> Result<ProcessStatus, String> {
    let mut guard = state
        .process
        .lock()
        .map_err(|_| "Grok 进程状态不可用。".to_string())?;
    if let Some(mut process) = guard.take() {
        process
            .child
            .kill()
            .map_err(|error| format!("停止 Grok Agent 失败：{error}"))?;
        let _ = process.child.wait();
    }
    *state
        .account_id
        .lock()
        .map_err(|_| "账号绑定状态不可用。".to_string())? = None;
    Ok(ProcessStatus {
        running: false,
        pid: None,
        account_id: None,
    })
}

#[tauri::command]
fn set_workspace(cwd: String, state: State<'_, GrokState>) -> Result<(), String> {
    let workspace = validate_workspace(&cwd)?;
    *state
        .workspace
        .lock()
        .map_err(|_| "工作区状态不可用。".to_string())? = Some(workspace);
    Ok(())
}

#[tauri::command]
fn read_text_file(
    path: String,
    line: Option<u32>,
    limit: Option<u32>,
    state: State<'_, GrokState>,
) -> Result<TextContent, String> {
    let workspace = current_workspace(&state)?;
    let file_path = resolve_within_workspace(&path, &workspace, false)?;
    let raw = fs::read_to_string(&file_path).map_err(|error| format!("读取失败：{error}"))?;
    Ok(TextContent {
        content: slice_lines(&raw, line, limit),
    })
}

#[tauri::command]
fn write_text_file(
    path: String,
    content: String,
    state: State<'_, GrokState>,
) -> Result<(), String> {
    let workspace = current_workspace(&state)?;
    let file_path = resolve_within_workspace(&path, &workspace, true)?;
    fs::write(&file_path, content).map_err(|error| format!("写入失败：{error}"))
}

fn run_git(workspace: &Path, args: &[&str]) -> Result<String, String> {
    let mut cmd = Command::new("git");
    configure_command(&mut cmd);
    let output = cmd
        .args(args)
        .current_dir(workspace)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .map_err(|error| format!("执行 git 失败：{error}"))?;
    if !output.status.success() {
        let err = String::from_utf8_lossy(&output.stderr);
        return Err(format!("git {} 失败：{}", args.join(" "), err.trim()));
    }
    Ok(String::from_utf8_lossy(&output.stdout).into_owned())
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct LocalGitFile {
    path: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    old_path: Option<String>,
    #[serde(rename = "type", skip_serializing_if = "Option::is_none")]
    file_type: Option<String>,
    additions: u32,
    deletions: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    patch: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct LocalGitStatus {
    branch: Option<String>,
    files: Vec<LocalGitFile>,
    available: bool,
}

fn classify_porcelain_code(code: &str) -> &'static str {
    let chars: Vec<char> = code.chars().collect();
    let a = chars.first().copied().unwrap_or(' ');
    let b = chars.get(1).copied().unwrap_or(' ');
    if a == '?' || b == '?' {
        return "add";
    }
    if a == 'A' || b == 'A' {
        return "add";
    }
    if a == 'D' || b == 'D' {
        return "delete";
    }
    if a == 'R' || b == 'R' || a == 'C' || b == 'C' {
        return "rename";
    }
    "edit"
}

fn parse_porcelain_entry(line: &str) -> Option<(String, Option<String>, &'static str, bool)> {
    if line.len() < 4 {
        return None;
    }
    let code = &line[..2];
    let rest = line[3..].trim();
    if rest.is_empty() {
        return None;
    }
    let untracked = code.starts_with('?');
    let file_type = classify_porcelain_code(code);
    if rest.contains(" -> ") {
        let mut parts = rest.splitn(2, " -> ");
        let old = parts.next()?.trim().trim_matches('"').to_string();
        let new = parts.next()?.trim().trim_matches('"').to_string();
        if new.is_empty() {
            return None;
        }
        return Some((new, Some(old), "rename", untracked));
    }
    let path = rest.trim_matches('"').to_string();
    Some((path, None, file_type, untracked))
}

fn count_patch_stats(patch: &str) -> (u32, u32) {
    let mut additions = 0u32;
    let mut deletions = 0u32;
    for line in patch.lines() {
        if line.starts_with("+++") || line.starts_with("---") || line.starts_with("@@") {
            continue;
        }
        if line.starts_with('+') {
            additions = additions.saturating_add(1);
        } else if line.starts_with('-') {
            deletions = deletions.saturating_add(1);
        }
    }
    (additions, deletions)
}

fn untracked_file_patch(workspace: &Path, path: &str) -> Option<String> {
    let full = workspace.join(path);
    let content = fs::read_to_string(&full).ok()?;
    let lines: Vec<&str> = content.lines().collect();
    let mut patch = format!(
        "diff --git a/{path} b/{path}\nnew file mode 100644\n--- /dev/null\n+++ b/{path}\n@@ -0,0 +1,{} @@\n",
        lines.len().max(1)
    );
    if lines.is_empty() {
        patch.push_str("+\n");
    } else {
        for line in lines {
            patch.push('+');
            patch.push_str(line);
            patch.push('\n');
        }
        if content.ends_with('\n') {
            // already emitted trailing newlines via lines()
        }
    }
    Some(patch)
}

fn collect_local_git(workspace: &Path) -> LocalGitStatus {
    if run_git(workspace, &["rev-parse", "--is-inside-work-tree"]).is_err() {
        return LocalGitStatus {
            branch: None,
            files: Vec::new(),
            available: false,
        };
    }

    let branch = run_git(workspace, &["rev-parse", "--abbrev-ref", "HEAD"])
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty() && value != "HEAD");

    // -uall expands untracked directories into files so the review pane never shows
    // empty directory rows with +0/−0 and no patch.
    let status = match run_git(workspace, &["status", "--porcelain=v1", "-uall"]) {
        Ok(value) => value,
        Err(_) => {
            return LocalGitStatus {
                branch,
                files: Vec::new(),
                available: true,
            };
        }
    };

    let mut files = Vec::new();
    for line in status.lines() {
        let Some((path, old_path, file_type, untracked)) = parse_porcelain_entry(line) else {
            continue;
        };
        let patch = if untracked {
            let full = workspace.join(&path);
            // Skip directory entries (should be rare with -uall) — they cannot produce a file patch.
            if full.is_dir() {
                continue;
            }
            untracked_file_patch(workspace, &path)
        } else {
            let text = run_git(workspace, &["diff", "HEAD", "--", &path]).unwrap_or_default();
            if text.trim().is_empty() {
                // staged-only rename/copy without remaining worktree delta may still need cached
                let staged = run_git(workspace, &["diff", "--cached", "HEAD", "--", &path])
                    .unwrap_or_default();
                if staged.trim().is_empty() {
                    None
                } else {
                    Some(staged)
                }
            } else {
                Some(text)
            }
        };
        let (additions, deletions) = patch.as_deref().map(count_patch_stats).unwrap_or((0, 0));
        files.push(LocalGitFile {
            path,
            old_path,
            file_type: Some(file_type.to_string()),
            additions,
            deletions,
            patch,
        });
    }

    files.sort_by(|a, b| a.path.cmp(&b.path));
    LocalGitStatus {
        branch,
        files,
        available: true,
    }
}

#[tauri::command]
fn git_workspace_status(state: State<'_, GrokState>) -> Result<LocalGitStatus, String> {
    let workspace = current_workspace(&state)?;
    Ok(collect_local_git(&workspace))
}

/// Resolve a user-facing path into a workspace-relative path suitable for git args.
fn relative_in_workspace(path: &str, workspace: &Path) -> Result<PathBuf, String> {
    let candidate = PathBuf::from(path);
    if candidate
        .components()
        .any(|component| matches!(component, std::path::Component::ParentDir))
    {
        // Disallow `..` segments unless we can prove the resolved path stays inside.
        let joined = workspace.join(&candidate);
        if let Ok(canon) = joined.canonicalize() {
            let ws = workspace
                .canonicalize()
                .map_err(|error| format!("无法解析工作区路径：{error}"))?;
            return canon
                .strip_prefix(&ws)
                .map(|p| p.to_path_buf())
                .map_err(|_| "路径不在工作区内。".to_string());
        }
        return Err("拒绝访问工作区以外的路径。".to_string());
    }

    if candidate.is_absolute() {
        let ws = workspace
            .canonicalize()
            .map_err(|error| format!("无法解析工作区路径：{error}"))?;
        if let Ok(file) = candidate.canonicalize() {
            return file
                .strip_prefix(&ws)
                .map(|p| p.to_path_buf())
                .map_err(|_| "路径不在工作区内。".to_string());
        }
        // Absolute path that does not exist yet (e.g. deleted) — strip workspace prefix if possible.
        if let Ok(stripped) = candidate.strip_prefix(&ws) {
            return Ok(stripped.to_path_buf());
        }
        if let Ok(stripped) = candidate.strip_prefix(workspace) {
            return Ok(stripped.to_path_buf());
        }
        return Err("路径不在工作区内。".to_string());
    }

    Ok(candidate)
}

fn porcelain_for(workspace: &Path, relative: &Path) -> String {
    run_git(
        workspace,
        &["status", "--porcelain", "--", &relative.to_string_lossy()],
    )
    .unwrap_or_default()
}

fn restore_one_path(workspace: &Path, relative: &Path) -> Result<(), String> {
    // Prefer modern restore (clears staged + worktree); fall back to checkout.
    let mut modern_cmd = Command::new("git");
    configure_command(&mut modern_cmd);
    let modern = modern_cmd
        .args(["restore", "--worktree", "--staged", "--"])
        .arg(relative)
        .current_dir(workspace)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status();

    if let Ok(status) = modern {
        if status.success() {
            return Ok(());
        }
    }

    let mut legacy_cmd = Command::new("git");
    configure_command(&mut legacy_cmd);
    let legacy = legacy_cmd
        .args(["checkout", "--"])
        .arg(relative)
        .current_dir(workspace)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .status()
        .map_err(|error| format!("执行 git checkout 失败：{error}"))?;

    if legacy.success() {
        return Ok(());
    }

    // Untracked files cannot be restored via checkout — remove them inside the sandbox.
    let absolute = workspace.join(relative);
    let line = porcelain_for(workspace, relative);
    if absolute.is_file() && line.trim_start().starts_with("??") {
        let ws = workspace
            .canonicalize()
            .map_err(|error| format!("无法解析工作区路径：{error}"))?;
        if let Ok(canon) = absolute.canonicalize() {
            if canon.starts_with(&ws) {
                fs::remove_file(&canon).map_err(|error| format!("删除未跟踪文件失败：{error}"))?;
                return Ok(());
            }
        }
    }

    Err(format!("git 还原失败：{}", relative.display()))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct GitPathResult {
    path: String,
    ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct GitBatchResult {
    results: Vec<GitPathResult>,
    succeeded: u32,
    failed: u32,
}

fn git_batch_paths(
    paths: Vec<String>,
    state: &State<'_, GrokState>,
    op: impl Fn(&Path, &Path) -> Result<(), String>,
) -> Result<GitBatchResult, String> {
    let workspace = current_workspace(state)?;
    let mut results = Vec::new();
    let mut succeeded = 0u32;
    let mut failed = 0u32;
    for path in paths {
        let trimmed = path.trim();
        if trimmed.is_empty() {
            continue;
        }
        match relative_in_workspace(trimmed, &workspace) {
            Ok(relative) => match op(&workspace, &relative) {
                Ok(()) => {
                    succeeded += 1;
                    results.push(GitPathResult {
                        path: trimmed.to_string(),
                        ok: true,
                        error: None,
                    });
                }
                Err(error) => {
                    failed += 1;
                    results.push(GitPathResult {
                        path: trimmed.to_string(),
                        ok: false,
                        error: Some(error),
                    });
                }
            },
            Err(error) => {
                failed += 1;
                results.push(GitPathResult {
                    path: trimmed.to_string(),
                    ok: false,
                    error: Some(error),
                });
            }
        }
    }
    Ok(GitBatchResult {
        results,
        succeeded,
        failed,
    })
}

fn stage_one_path(workspace: &Path, relative: &Path) -> Result<(), String> {
    let mut cmd = Command::new("git");
    configure_command(&mut cmd);
    let status = cmd
        .args(["add", "--"])
        .arg(relative)
        .current_dir(workspace)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .status()
        .map_err(|error| format!("执行 git add 失败：{error}"))?;
    if !status.success() {
        return Err(format!("git add 失败：{}", relative.display()));
    }
    Ok(())
}

#[tauri::command]
fn git_restore_file(path: String, state: State<'_, GrokState>) -> Result<(), String> {
    let workspace = current_workspace(&state)?;
    let relative = relative_in_workspace(&path, &workspace)?;
    restore_one_path(&workspace, &relative)
}

#[tauri::command]
fn git_restore_files(
    paths: Vec<String>,
    state: State<'_, GrokState>,
) -> Result<GitBatchResult, String> {
    git_batch_paths(paths, &state, restore_one_path)
}

#[tauri::command]
fn git_stage_files(
    paths: Vec<String>,
    state: State<'_, GrokState>,
) -> Result<GitBatchResult, String> {
    git_batch_paths(paths, &state, stage_one_path)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct GitCommitResult {
    ok: bool,
    message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

/// Create a git commit with the given message.
///
/// When `paths` is non-empty, only those workspace-relative paths are staged and
/// committed (`git commit -m … -- <paths>`), so unrelated index entries are not
/// included. When `paths` is empty/None, commits the full index (legacy).
#[tauri::command]
fn git_commit(
    message: String,
    paths: Option<Vec<String>>,
    state: State<'_, GrokState>,
) -> Result<GitCommitResult, String> {
    let workspace = current_workspace(&state)?;
    let trimmed = message.trim();
    if trimmed.is_empty() {
        return Ok(GitCommitResult {
            ok: false,
            message: String::new(),
            error: Some("提交说明不能为空".into()),
        });
    }

    let mut rel_paths: Vec<PathBuf> = Vec::new();
    if let Some(raw_paths) = paths {
        for path in raw_paths {
            let trimmed_path = path.trim();
            if trimmed_path.is_empty() {
                continue;
            }
            match relative_in_workspace(trimmed_path, &workspace) {
                Ok(relative) => rel_paths.push(relative),
                Err(error) => {
                    return Ok(GitCommitResult {
                        ok: false,
                        message: trimmed.to_string(),
                        error: Some(error),
                    });
                }
            }
        }
        // Stage only the intended paths before a path-limited commit.
        for relative in &rel_paths {
            if let Err(error) = stage_one_path(&workspace, relative) {
                return Ok(GitCommitResult {
                    ok: false,
                    message: trimmed.to_string(),
                    error: Some(error),
                });
            }
        }
        if rel_paths.is_empty() {
            return Ok(GitCommitResult {
                ok: false,
                message: trimmed.to_string(),
                error: Some("没有可提交的文件路径".into()),
            });
        }
    }

    // Refuse when nothing is staged (full index) or nothing to commit for pathspecs.
    // git diff --cached --quiet: exit 0 = no staged diff, 1 = has staged diff, other = error.
    let mut status_cmd = Command::new("git");
    configure_command(&mut status_cmd);
    status_cmd
        .args(["diff", "--cached", "--quiet"])
        .current_dir(&workspace)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::piped());
    if !rel_paths.is_empty() {
        status_cmd.arg("--");
        for relative in &rel_paths {
            status_cmd.arg(relative);
        }
    }
    let status_out = status_cmd
        .output()
        .map_err(|error| format!("检查暂存区失败：{error}"))?;
    match status_out.status.code() {
        Some(0) => {
            return Ok(GitCommitResult {
                ok: false,
                message: trimmed.to_string(),
                error: Some("暂存区为空，请先确认审阅或暂存文件".into()),
            });
        }
        Some(1) => { /* has staged changes for the scope — proceed */ }
        code => {
            let stderr = String::from_utf8_lossy(&status_out.stderr)
                .trim()
                .to_string();
            let detail = if stderr.is_empty() {
                format!("检查暂存区失败（exit {code:?}）")
            } else {
                format!("检查暂存区失败（exit {code:?}）：{stderr}")
            };
            return Ok(GitCommitResult {
                ok: false,
                message: trimmed.to_string(),
                error: Some(detail),
            });
        }
    }

    let mut cmd = Command::new("git");
    configure_command(&mut cmd);
    cmd.args(["commit", "-m", trimmed]);
    if !rel_paths.is_empty() {
        // Pathspecs: commit only these paths; ignore other staged files.
        cmd.arg("--");
        for relative in &rel_paths {
            cmd.arg(relative);
        }
    }
    let output = cmd
        .current_dir(&workspace)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .map_err(|error| format!("执行 git commit 失败：{error}"))?;
    if output.status.success() {
        return Ok(GitCommitResult {
            ok: true,
            message: trimmed.to_string(),
            error: None,
        });
    }
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let detail = if !stderr.is_empty() {
        stderr
    } else if !stdout.is_empty() {
        stdout
    } else {
        "git commit 失败".into()
    };
    Ok(GitCommitResult {
        ok: false,
        message: trimmed.to_string(),
        error: Some(detail),
    })
}

fn default_shell() -> (String, Vec<String>) {
    #[cfg(windows)]
    {
        ("powershell.exe".into(), vec!["-NoLogo".into()])
    }
    #[cfg(not(windows))]
    {
        let shell = env::var("SHELL").unwrap_or_else(|_| "/bin/bash".into());
        (shell, Vec::new())
    }
}

#[tauri::command]
fn terminal_create(
    command: String,
    args: Option<Vec<String>>,
    cwd: Option<String>,
    env: Option<Vec<HashMap<String, String>>>,
    output_byte_limit: Option<u64>,
    interactive: Option<bool>,
    app: AppHandle,
    state: State<'_, GrokState>,
) -> Result<TerminalCreateResult, String> {
    if command.trim().is_empty() {
        return Err("命令不能为空。".to_string());
    }
    let workdir = if let Some(path) = cwd
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        let validated = validate_workspace(path)?;
        // Remember workspace so subsequent fs/git commands share the same root.
        if let Ok(mut guard) = state.workspace.lock() {
            *guard = Some(validated.clone());
        }
        validated
    } else {
        current_workspace(&state)?
    };
    let limit = output_byte_limit.unwrap_or(1_048_576) as usize;
    let args = args.unwrap_or_default();
    let interactive = interactive.unwrap_or(false);

    let mut cmd = Command::new(&command);
    configure_command(&mut cmd);
    cmd.args(&args)
        .current_dir(&workdir)
        .stdin(if interactive {
            Stdio::piped()
        } else {
            Stdio::null()
        })
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    if let Some(entries) = env {
        for entry in entries {
            if let (Some(name), Some(value)) = (entry.get("name"), entry.get("value")) {
                cmd.env(name, value);
            }
        }
    }

    let mut child = cmd
        .spawn()
        .map_err(|error| format!("启动终端命令失败：{error}"))?;
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "无法读取终端 stdout。".to_string())?;
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| "无法读取终端 stderr。".to_string())?;
    let stdin = if interactive {
        child.stdin.take()
    } else {
        None
    };

    let terminal_id = format!("term_{}", TERMINAL_SEQ.fetch_add(1, Ordering::Relaxed));
    let name = if args.is_empty() {
        command.clone()
    } else {
        format!("{command} {}", args.join(" "))
    };

    let output = Arc::new(Mutex::new(String::new()));
    let truncated = Arc::new(Mutex::new(false));
    // Seed interactive sessions so the UI is not empty before first output.
    if interactive {
        append_output(&output, &truncated, &format!("$ {name}\n"), limit);
    }
    pump_reader(
        stdout,
        output.clone(),
        truncated.clone(),
        limit,
        app.clone(),
        terminal_id.clone(),
    );
    pump_reader(
        stderr,
        output.clone(),
        truncated.clone(),
        limit,
        app,
        terminal_id.clone(),
    );

    state
        .terminals
        .lock()
        .map_err(|_| "终端状态不可用。".to_string())?
        .insert(
            terminal_id.clone(),
            ManagedTerminal {
                child,
                stdin,
                output,
                truncated,
                output_byte_limit: limit,
                name,
                interactive,
            },
        );

    Ok(TerminalCreateResult { terminal_id })
}

/// Open a local interactive shell in the current workspace (PowerShell on Windows).
#[tauri::command]
fn terminal_open_shell(
    cwd: Option<String>,
    app: AppHandle,
    state: State<'_, GrokState>,
) -> Result<TerminalCreateResult, String> {
    let (command, args) = default_shell();
    terminal_create(command, Some(args), cwd, None, None, Some(true), app, state)
}

#[tauri::command]
fn terminal_write(
    terminal_id: String,
    data: String,
    state: State<'_, GrokState>,
) -> Result<(), String> {
    let mut terminals = state
        .terminals
        .lock()
        .map_err(|_| "终端状态不可用。".to_string())?;
    let terminal = terminals
        .get_mut(&terminal_id)
        .ok_or_else(|| format!("终端不存在：{terminal_id}"))?;

    if child_exit_status(&mut terminal.child)?.is_some() {
        return Err("终端进程已退出，无法写入。".to_string());
    }

    let stdin = terminal
        .stdin
        .as_mut()
        .ok_or_else(|| "该终端不是交互模式（无 stdin）。".to_string())?;

    // Echo the typed line into the output buffer (non-TTY shells rarely echo).
    let echo = if data.ends_with('\n') {
        format!("› {data}")
    } else {
        format!("› {data}\n")
    };
    append_output(
        &terminal.output,
        &terminal.truncated,
        &echo,
        terminal.output_byte_limit,
    );

    let mut payload = data.into_bytes();
    if !payload.ends_with(b"\n") {
        payload.push(b'\n');
    }
    stdin
        .write_all(&payload)
        .map_err(|error| format!("写入终端失败：{error}"))?;
    stdin
        .flush()
        .map_err(|error| format!("刷新终端 stdin 失败：{error}"))?;
    Ok(())
}

#[tauri::command]
fn terminal_output(
    terminal_id: String,
    state: State<'_, GrokState>,
) -> Result<TerminalOutputResult, String> {
    let mut terminals = state
        .terminals
        .lock()
        .map_err(|_| "终端状态不可用。".to_string())?;
    let terminal = terminals
        .get_mut(&terminal_id)
        .ok_or_else(|| format!("终端不存在：{terminal_id}"))?;
    let output = terminal
        .output
        .lock()
        .map_err(|_| "无法读取终端输出。".to_string())?
        .clone();
    let truncated = *terminal
        .truncated
        .lock()
        .map_err(|_| "无法读取截断状态。".to_string())?;
    let exit_status = child_exit_status(&mut terminal.child)?;
    Ok(TerminalOutputResult {
        output,
        truncated,
        exit_status,
    })
}

#[tauri::command]
fn terminal_wait_for_exit(
    terminal_id: String,
    state: State<'_, GrokState>,
) -> Result<TerminalExitStatus, String> {
    loop {
        let status = {
            let mut terminals = state
                .terminals
                .lock()
                .map_err(|_| "终端状态不可用。".to_string())?;
            let terminal = terminals
                .get_mut(&terminal_id)
                .ok_or_else(|| format!("终端不存在：{terminal_id}"))?;
            child_exit_status(&mut terminal.child)?
        };
        if let Some(done) = status {
            return Ok(done);
        }
        thread::sleep(Duration::from_millis(50));
    }
}

#[tauri::command]
fn terminal_kill(terminal_id: String, state: State<'_, GrokState>) -> Result<(), String> {
    let mut terminals = state
        .terminals
        .lock()
        .map_err(|_| "终端状态不可用。".to_string())?;
    let terminal = terminals
        .get_mut(&terminal_id)
        .ok_or_else(|| format!("终端不存在：{terminal_id}"))?;
    let _ = terminal.child.kill();
    let _ = terminal.child.try_wait();
    Ok(())
}

#[tauri::command]
fn terminal_release(terminal_id: String, state: State<'_, GrokState>) -> Result<(), String> {
    let mut terminals = state
        .terminals
        .lock()
        .map_err(|_| "终端状态不可用。".to_string())?;
    if let Some(mut terminal) = terminals.remove(&terminal_id) {
        let _ = terminal.child.kill();
        let _ = terminal.child.wait();
    }
    Ok(())
}

#[tauri::command]
fn terminal_list(state: State<'_, GrokState>) -> Result<Vec<TerminalListItem>, String> {
    let mut terminals = state
        .terminals
        .lock()
        .map_err(|_| "终端状态不可用。".to_string())?;
    let mut items = Vec::new();
    for (terminal_id, terminal) in terminals.iter_mut() {
        let output = terminal
            .output
            .lock()
            .map_err(|_| "无法读取终端输出。".to_string())?
            .clone();
        let truncated = *terminal
            .truncated
            .lock()
            .map_err(|_| "无法读取截断状态。".to_string())?;
        let exit = child_exit_status(&mut terminal.child)?;
        let status = if exit.is_some() { "exited" } else { "running" };
        items.push(TerminalListItem {
            terminal_id: terminal_id.clone(),
            name: terminal.name.clone(),
            status: status.to_string(),
            exit_code: exit.and_then(|value| value.exit_code),
            output,
            truncated,
            interactive: terminal.interactive && terminal.stdin.is_some(),
        });
    }
    items.sort_by(|a, b| a.terminal_id.cmp(&b.terminal_id));
    Ok(items)
}

#[tauri::command]
fn ensure_legacy_account(app: AppHandle) -> Result<LegacyAccountResult, String> {
    let path = global_auth_path()?;
    if !path.is_file() {
        return Ok(LegacyAccountResult {
            account_id: None,
            credential_exists: false,
        });
    }
    let accounts_dir = app_accounts_dir(&app)?;
    fs::create_dir_all(&accounts_dir).map_err(|error| format!("无法创建账号目录：{error}"))?;
    let marker = accounts_dir.join(LEGACY_MARKER_FILE);
    if !marker.exists() {
        fs::write(&marker, LEGACY_ACCOUNT_ID.as_bytes())
            .map_err(|error| format!("无法写入旧账号迁移标记：{error}"))?;
    }
    Ok(LegacyAccountResult {
        account_id: Some(LEGACY_ACCOUNT_ID.to_string()),
        credential_exists: true,
    })
}

#[tauri::command]
fn inspect_account_credential(
    account_id: String,
    app: AppHandle,
    state: State<'_, GrokState>,
) -> Result<CredentialInspection, String> {
    let _credential_guard = state
        .credential_io
        .lock()
        .map_err(|_| "凭据存储状态不可用。".to_string())?;
    let path = account_auth_path(&app, &account_id)?;
    inspect_auth_file(&path)
}

#[tauri::command]
fn import_account_credential(
    account_id: String,
    raw: String,
    app: AppHandle,
    state: State<'_, GrokState>,
) -> Result<CredentialImportResult, String> {
    let _credential_guard = state
        .credential_io
        .lock()
        .map_err(|_| "凭据存储状态不可用。".to_string())?;
    if account_id == LEGACY_ACCOUNT_ID {
        return Err("默认旧账号不能通过导入覆盖。".to_string());
    }
    let path = account_auth_path(&app, &account_id)?;
    let (store, result) = credential_to_auth_store(&raw)?;
    atomic_write_json(&path, &store)?;
    Ok(result)
}

#[tauri::command]
fn migrate_keyring_credential(
    account_id: String,
    key: String,
    app: AppHandle,
    state: State<'_, GrokState>,
) -> Result<CredentialImportResult, String> {
    let _credential_guard = state
        .credential_io
        .lock()
        .map_err(|_| "凭据存储状态不可用。".to_string())?;
    if key.is_empty()
        || key.len() > 128
        || !key
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_'))
    {
        return Err("旧钥匙串标识无效。".to_string());
    }
    let entry =
        keyring::Entry::new("grok-forge", &key).map_err(|_| "无法访问旧钥匙串项。".to_string())?;
    let path = account_auth_path(&app, &account_id)?;
    // A prior attempt may have committed auth.json but failed to remove the
    // keyring copy. Never overwrite that file on retry: the Agent may already
    // have rotated its refresh token in the meantime.
    if path.is_file() {
        let inspection = inspect_auth_file(&path)?;
        if !can_finalize_keyring_migration(&inspection) {
            return Err("目标账号凭据不可用，已保留旧钥匙串副本。".to_string());
        }
        delete_keyring_entry_if_present(&entry)?;
        return Ok(CredentialImportResult {
            renewal: inspection.renewal,
            auth_status: inspection.auth_status,
            expires_at: inspection.expires_at,
            account_label: inspection.account_label,
        });
    }
    let raw = entry
        .get_password()
        .map_err(|_| "无法读取旧钥匙串凭据。".to_string())?;
    let normalized = if raw.trim_start().starts_with('{') {
        raw
    } else {
        serde_json::json!({ "access_token": raw }).to_string()
    };
    let (store, result) = credential_to_auth_store(&normalized)?;
    atomic_write_json(&path, &store)?;
    delete_keyring_entry_if_present(&entry)?;
    Ok(result)
}

#[tauri::command]
fn delete_account_credential(
    account_id: String,
    app: AppHandle,
    state: State<'_, GrokState>,
) -> Result<(), String> {
    let _credential_guard = state
        .credential_io
        .lock()
        .map_err(|_| "凭据存储状态不可用。".to_string())?;
    if state
        .account_id
        .lock()
        .map_err(|_| "账号绑定状态不可用。".to_string())?
        .as_deref()
        == Some(account_id.as_str())
    {
        return Err("删除当前账号凭据前必须先停止 Grok Agent。".to_string());
    }
    let path = account_auth_path(&app, &account_id)?;
    if path.exists() {
        fs::remove_file(&path).map_err(|error| format!("无法删除账号凭据：{error}"))?;
    }
    if account_id == LEGACY_ACCOUNT_ID {
        let _ = fs::remove_file(app_accounts_dir(&app)?.join(LEGACY_MARKER_FILE));
    } else {
        if let Some(parent) = path.parent() {
            let _ = fs::remove_dir(parent);
        }
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(GrokState::default())
        .invoke_handler(tauri::generate_handler![
            ensure_legacy_account,
            inspect_account_credential,
            import_account_credential,
            migrate_keyring_credential,
            delete_account_credential,
            grok_status,
            start_grok,
            send_grok_rpc,
            stop_grok,
            set_workspace,
            read_text_file,
            write_text_file,
            git_workspace_status,
            git_restore_file,
            git_restore_files,
            git_stage_files,
            git_commit,
            terminal_create,
            terminal_open_shell,
            terminal_write,
            terminal_output,
            terminal_wait_for_exit,
            terminal_kill,
            terminal_release,
            terminal_list
        ])
        .setup(|app| {
            let listener_handle = app.handle().clone();
            let state_handle = listener_handle.clone();
            listener_handle.listen("tauri://close-requested", move |_| {
                let state = state_handle.state::<GrokState>();
                if let Ok(mut guard) = state.process.lock() {
                    if let Some(mut process) = guard.take() {
                        let _ = process.child.kill();
                    }
                };
                if let Ok(mut account_id) = state.account_id.lock() {
                    *account_id = None;
                }
                if let Ok(mut terminals) = state.terminals.lock() {
                    for (_, mut terminal) in terminals.drain() {
                        let _ = terminal.child.kill();
                    }
                };
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Grok Forge");
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::time::{SystemTime, UNIX_EPOCH};

    #[test]
    fn only_valid_destination_can_finalize_keyring_migration() {
        assert!(can_finalize_keyring_migration(&CredentialInspection {
            exists: true,
            renewal: "refreshable",
            auth_status: "valid",
            expires_at: None,
            account_label: None,
        }));
        assert!(!can_finalize_keyring_migration(&CredentialInspection {
            exists: true,
            renewal: "unknown",
            auth_status: "relogin-required",
            expires_at: None,
            account_label: None,
        }));
        assert!(!can_finalize_keyring_migration(&CredentialInspection {
            exists: false,
            renewal: "unknown",
            auth_status: "relogin-required",
            expires_at: None,
            account_label: None,
        }));
    }

    #[test]
    fn rejects_empty_workspace() {
        assert_eq!(
            validate_workspace("  ").unwrap_err(),
            "工作区路径不能为空。"
        );
    }

    #[test]
    fn accepts_existing_workspace() {
        assert!(validate_workspace(".").is_ok());
    }

    #[test]
    fn grok_fallback_is_always_available_as_a_path_candidate() {
        assert!(grok_candidates()
            .iter()
            .any(|path| path == Path::new("grok")));
    }

    #[test]
    fn slices_lines_from_one_based_offset() {
        let text = "a\nb\nc\nd\n";
        assert_eq!(slice_lines(text, Some(2), Some(2)), "b\nc");
        assert_eq!(slice_lines(text, Some(1), None), "a\nb\nc\nd\n");
    }

    #[test]
    fn blocks_paths_outside_workspace() {
        let stamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_millis();
        let root = std::env::temp_dir().join(format!("grok-forge-ws-{stamp}"));
        let outside = std::env::temp_dir().join(format!("grok-forge-out-{stamp}.txt"));
        fs::create_dir_all(&root).unwrap();
        fs::write(root.join("inside.txt"), "ok").unwrap();
        fs::write(&outside, "nope").unwrap();

        assert!(resolve_within_workspace("inside.txt", &root, false).is_ok());
        assert!(
            resolve_within_workspace(outside.to_string_lossy().as_ref(), &root, false).is_err()
        );

        let _ = fs::remove_dir_all(&root);
        let _ = fs::remove_file(&outside);
    }

    #[test]
    fn truncates_terminal_output_at_char_boundary() {
        let buffer = Arc::new(Mutex::new(String::new()));
        let truncated = Arc::new(Mutex::new(false));
        append_output(&buffer, &truncated, "abcdefghij", 5);
        let text = buffer.lock().unwrap().clone();
        assert!(text.len() <= 5);
        assert!(*truncated.lock().unwrap());
    }

    #[test]
    fn parses_porcelain_status_lines() {
        let edit = parse_porcelain_entry(" M src/a.ts").unwrap();
        assert_eq!(edit.0, "src/a.ts");
        assert_eq!(edit.2, "edit");
        assert!(!edit.3);

        let add = parse_porcelain_entry("?? new.rs").unwrap();
        assert_eq!(add.0, "new.rs");
        assert_eq!(add.2, "add");
        assert!(add.3);

        let rename = parse_porcelain_entry("R  old.ts -> new.ts").unwrap();
        assert_eq!(rename.0, "new.ts");
        assert_eq!(rename.1.as_deref(), Some("old.ts"));
        assert_eq!(rename.2, "rename");
    }

    #[test]
    fn counts_patch_additions_and_deletions() {
        let patch = "--- a/x\n+++ b/x\n@@ -1 +1 @@\n-old\n+new\n+extra\n";
        assert_eq!(count_patch_stats(patch), (2, 1));
    }

    #[test]
    fn collects_local_git_from_temp_repo() {
        let stamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_millis();
        let root = std::env::temp_dir().join(format!("grok-forge-git-{stamp}"));
        fs::create_dir_all(&root).unwrap();
        let git = |args: &[&str]| {
            let status = Command::new("git")
                .args(args)
                .current_dir(&root)
                .stdin(Stdio::null())
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .status()
                .expect("git available");
            assert!(status.success(), "git {args:?} failed");
        };
        git(&["init"]);
        git(&["config", "user.email", "test@example.com"]);
        git(&["config", "user.name", "Test"]);
        fs::write(root.join("tracked.txt"), "one\n").unwrap();
        git(&["add", "tracked.txt"]);
        git(&["commit", "-m", "init"]);
        fs::write(root.join("tracked.txt"), "two\n").unwrap();
        fs::write(root.join("fresh.txt"), "hello\n").unwrap();

        let status = collect_local_git(&root);
        assert!(status.available);
        assert!(status
            .files
            .iter()
            .any(|file| file.path == "tracked.txt" && file.additions > 0));
        assert!(status
            .files
            .iter()
            .any(|file| file.path == "fresh.txt" && file.file_type.as_deref() == Some("add")));

        // Stage tracked edit, then restore both tracked + untracked.
        stage_one_path(&root, Path::new("tracked.txt")).unwrap();
        restore_one_path(&root, Path::new("tracked.txt")).unwrap();
        restore_one_path(&root, Path::new("fresh.txt")).unwrap();
        assert_eq!(
            fs::read_to_string(root.join("tracked.txt"))
                .unwrap()
                .replace("\r\n", "\n"),
            "one\n"
        );
        assert!(!root.join("fresh.txt").exists());

        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn path_limited_commit_excludes_unrelated_staged() {
        let stamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_millis();
        let root = std::env::temp_dir().join(format!("grok-forge-commit-{stamp}"));
        fs::create_dir_all(&root).unwrap();
        let git = |args: &[&str]| {
            let status = Command::new("git")
                .args(args)
                .current_dir(&root)
                .stdin(Stdio::null())
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .status()
                .expect("git available");
            assert!(status.success(), "git {args:?} failed");
        };
        git(&["init"]);
        git(&["config", "user.email", "test@example.com"]);
        git(&["config", "user.name", "Test"]);
        fs::write(root.join("a.txt"), "a1\n").unwrap();
        fs::write(root.join("b.txt"), "b1\n").unwrap();
        git(&["add", "a.txt", "b.txt"]);
        git(&["commit", "-m", "init"]);

        fs::write(root.join("a.txt"), "a2\n").unwrap();
        fs::write(root.join("b.txt"), "b2\n").unwrap();
        stage_one_path(&root, Path::new("a.txt")).unwrap();
        stage_one_path(&root, Path::new("b.txt")).unwrap();

        // Path-limited commit for a.txt only — b.txt stays staged but uncommitted.
        let mut cmd = Command::new("git");
        configure_command(&mut cmd);
        let output = cmd
            .args(["commit", "-m", "only a", "--", "a.txt"])
            .current_dir(&root)
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .output()
            .expect("git commit");
        assert!(
            output.status.success(),
            "path-limited commit failed: {}",
            String::from_utf8_lossy(&output.stderr)
        );

        // b.txt still differs from HEAD
        let status = collect_local_git(&root);
        assert!(status.files.iter().any(|file| file.path == "b.txt"));
        assert!(!status.files.iter().any(|file| file.path == "a.txt"));

        // Empty-index check via exit code semantics used by git_commit
        let empty = Command::new("git")
            .args(["diff", "--cached", "--quiet", "--", "a.txt"])
            .current_dir(&root)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()
            .expect("diff");
        assert_eq!(empty.code(), Some(0));

        let still_b = Command::new("git")
            .args(["diff", "--cached", "--quiet", "--", "b.txt"])
            .current_dir(&root)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()
            .expect("diff b");
        assert_eq!(still_b.code(), Some(1));

        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn relative_paths_reject_parent_escape() {
        let stamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_millis();
        let root = std::env::temp_dir().join(format!("grok-forge-rel-{stamp}"));
        fs::create_dir_all(&root).unwrap();
        assert!(relative_in_workspace("ok.txt", &root).is_ok());
        assert!(relative_in_workspace("../outside.txt", &root).is_err());
        let _ = fs::remove_dir_all(&root);
    }
}
