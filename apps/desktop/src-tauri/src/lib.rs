use serde::Serialize;
use serde_json::Value;
use std::collections::HashMap;
use std::env;
use std::fs;
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
        candidates.push(PathBuf::from(profile).join(".grok").join("bin").join("grok.exe"));
    }
    candidates.push(PathBuf::from("grok"));
    candidates
}

fn resolve_grok_binary() -> Result<PathBuf, String> {
    grok_candidates()
        .into_iter()
        .find(|candidate| {
            candidate == Path::new("grok") || fs::metadata(candidate).is_ok_and(|meta| meta.is_file())
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
    let guard = state.workspace.lock().map_err(|_| "工作区状态不可用。".to_string())?;
    guard
        .clone()
        .ok_or_else(|| "尚未设置工作区，请先连接 Grok。".to_string())
}

fn resolve_within_workspace(path: &str, workspace: &Path, create_parents: bool) -> Result<PathBuf, String> {
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

fn append_output(buffer: &Arc<Mutex<String>>, truncated: &Arc<Mutex<bool>>, chunk: &str, limit: usize) {
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
        version: if version.is_empty() { "Grok Build".into() } else { version },
        path: binary.to_string_lossy().into_owned(),
        workspace_path: env::current_dir()
            .map(|path| path.to_string_lossy().into_owned())
            .unwrap_or_default(),
    })
}

fn emit_json_lines<R: std::io::Read + Send + 'static>(reader: R, app: AppHandle, event: &'static str) {
    std::thread::spawn(move || {
        for line in BufReader::new(reader).lines().map_while(Result::ok) {
            let payload = serde_json::from_str::<Value>(&line)
                .unwrap_or_else(|_| serde_json::json!({ "raw": line }));
            let _ = app.emit(event, payload);
        }
    });
}

#[tauri::command]
fn start_grok(cwd: String, app: AppHandle, state: State<'_, GrokState>) -> Result<ProcessStatus, String> {
    let workspace = validate_workspace(&cwd)?;
    let mut guard = state.process.lock().map_err(|_| "Grok 进程状态不可用。".to_string())?;

    if let Some(process) = guard.as_mut() {
        if process.child.try_wait().map_err(|error| error.to_string())?.is_none() {
            *state.workspace.lock().map_err(|_| "工作区状态不可用。".to_string())? = Some(workspace.clone());
            return Ok(ProcessStatus { running: true, pid: Some(process.child.id()) });
        }
        *guard = None;
    }

    let binary = resolve_grok_binary()?;
    let mut cmd = Command::new(binary);
    configure_command(&mut cmd);
    let mut child = cmd
        .args(["agent", "stdio"])
        .current_dir(&workspace)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| format!("启动 Grok Agent 失败：{error}"))?;

    let stdin = child.stdin.take().ok_or_else(|| "无法连接 Grok stdin。".to_string())?;
    let stdout = child.stdout.take().ok_or_else(|| "无法连接 Grok stdout。".to_string())?;
    let stderr = child.stderr.take().ok_or_else(|| "无法连接 Grok stderr。".to_string())?;
    let pid = child.id();

    emit_json_lines(stdout, app.clone(), "grok://message");
    emit_json_lines(stderr, app, "grok://stderr");
    *guard = Some(GrokProcess { child, stdin });
    *state.workspace.lock().map_err(|_| "工作区状态不可用。".to_string())? = Some(workspace);

    Ok(ProcessStatus { running: true, pid: Some(pid) })
}

#[tauri::command]
fn send_grok_rpc(payload: Value, state: State<'_, GrokState>) -> Result<(), String> {
    let mut guard = state.process.lock().map_err(|_| "Grok 进程状态不可用。".to_string())?;
    let process = guard.as_mut().ok_or_else(|| "Grok Agent 尚未启动。".to_string())?;
    let mut line = serde_json::to_vec(&payload).map_err(|error| error.to_string())?;
    line.push(b'\n');
    process.stdin.write_all(&line).map_err(|error| format!("发送 ACP 消息失败：{error}"))?;
    process.stdin.flush().map_err(|error| format!("刷新 ACP 消息失败：{error}"))
}

#[tauri::command]
fn stop_grok(state: State<'_, GrokState>) -> Result<ProcessStatus, String> {
    let mut guard = state.process.lock().map_err(|_| "Grok 进程状态不可用。".to_string())?;
    if let Some(mut process) = guard.take() {
        process.child.kill().map_err(|error| format!("停止 Grok Agent 失败：{error}"))?;
        let _ = process.child.wait();
    }
    Ok(ProcessStatus { running: false, pid: None })
}

#[tauri::command]
fn set_workspace(cwd: String, state: State<'_, GrokState>) -> Result<(), String> {
    let workspace = validate_workspace(&cwd)?;
    *state.workspace.lock().map_err(|_| "工作区状态不可用。".to_string())? = Some(workspace);
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
fn write_text_file(path: String, content: String, state: State<'_, GrokState>) -> Result<(), String> {
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
        return Err(format!(
            "git {} 失败：{}",
            args.join(" "),
            err.trim()
        ));
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
        let (additions, deletions) = patch
            .as_deref()
            .map(count_patch_stats)
            .unwrap_or((0, 0));
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
fn git_restore_files(paths: Vec<String>, state: State<'_, GrokState>) -> Result<GitBatchResult, String> {
    git_batch_paths(paths, &state, restore_one_path)
}

#[tauri::command]
fn git_stage_files(paths: Vec<String>, state: State<'_, GrokState>) -> Result<GitBatchResult, String> {
    git_batch_paths(paths, &state, stage_one_path)
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
    let workdir = if let Some(path) = cwd.as_deref().map(str::trim).filter(|value| !value.is_empty()) {
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
    let stdout = child.stdout.take().ok_or_else(|| "无法读取终端 stdout。".to_string())?;
    let stderr = child.stderr.take().ok_or_else(|| "无法读取终端 stderr。".to_string())?;
    let stdin = if interactive { child.stdin.take() } else { None };

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
        append_output(
            &output,
            &truncated,
            &format!("$ {name}\n"),
            limit,
        );
    }
    pump_reader(stdout, output.clone(), truncated.clone(), limit, app.clone(), terminal_id.clone());
    pump_reader(stderr, output.clone(), truncated.clone(), limit, app, terminal_id.clone());

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
    terminal_create(
        command,
        Some(args),
        cwd,
        None,
        None,
        Some(true),
        app,
        state,
    )
}

#[tauri::command]
fn terminal_write(
    terminal_id: String,
    data: String,
    state: State<'_, GrokState>,
) -> Result<(), String> {
    let mut terminals = state.terminals.lock().map_err(|_| "终端状态不可用。".to_string())?;
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
fn terminal_output(terminal_id: String, state: State<'_, GrokState>) -> Result<TerminalOutputResult, String> {
    let mut terminals = state.terminals.lock().map_err(|_| "终端状态不可用。".to_string())?;
    let terminal = terminals
        .get_mut(&terminal_id)
        .ok_or_else(|| format!("终端不存在：{terminal_id}"))?;
    let output = terminal.output.lock().map_err(|_| "无法读取终端输出。".to_string())?.clone();
    let truncated = *terminal.truncated.lock().map_err(|_| "无法读取截断状态。".to_string())?;
    let exit_status = child_exit_status(&mut terminal.child)?;
    Ok(TerminalOutputResult {
        output,
        truncated,
        exit_status,
    })
}

#[tauri::command]
fn terminal_wait_for_exit(terminal_id: String, state: State<'_, GrokState>) -> Result<TerminalExitStatus, String> {
    loop {
        let status = {
            let mut terminals = state.terminals.lock().map_err(|_| "终端状态不可用。".to_string())?;
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
    let mut terminals = state.terminals.lock().map_err(|_| "终端状态不可用。".to_string())?;
    let terminal = terminals
        .get_mut(&terminal_id)
        .ok_or_else(|| format!("终端不存在：{terminal_id}"))?;
    let _ = terminal.child.kill();
    let _ = terminal.child.try_wait();
    Ok(())
}

#[tauri::command]
fn terminal_release(terminal_id: String, state: State<'_, GrokState>) -> Result<(), String> {
    let mut terminals = state.terminals.lock().map_err(|_| "终端状态不可用。".to_string())?;
    if let Some(mut terminal) = terminals.remove(&terminal_id) {
        let _ = terminal.child.kill();
        let _ = terminal.child.wait();
    }
    Ok(())
}

#[tauri::command]
fn terminal_list(state: State<'_, GrokState>) -> Result<Vec<TerminalListItem>, String> {
    let mut terminals = state.terminals.lock().map_err(|_| "终端状态不可用。".to_string())?;
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(GrokState::default())
        .invoke_handler(tauri::generate_handler![
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
    fn rejects_empty_workspace() {
        assert_eq!(validate_workspace("  ").unwrap_err(), "工作区路径不能为空。");
    }

    #[test]
    fn accepts_existing_workspace() {
        assert!(validate_workspace(".").is_ok());
    }

    #[test]
    fn grok_fallback_is_always_available_as_a_path_candidate() {
        assert!(grok_candidates().iter().any(|path| path == Path::new("grok")));
    }

    #[test]
    fn slices_lines_from_one_based_offset() {
        let text = "a\nb\nc\nd\n";
        assert_eq!(slice_lines(text, Some(2), Some(2)), "b\nc");
        assert_eq!(slice_lines(text, Some(1), None), "a\nb\nc\nd\n");
    }

    #[test]
    fn blocks_paths_outside_workspace() {
        let stamp = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_millis();
        let root = std::env::temp_dir().join(format!("grok-forge-ws-{stamp}"));
        let outside = std::env::temp_dir().join(format!("grok-forge-out-{stamp}.txt"));
        fs::create_dir_all(&root).unwrap();
        fs::write(root.join("inside.txt"), "ok").unwrap();
        fs::write(&outside, "nope").unwrap();

        assert!(resolve_within_workspace("inside.txt", &root, false).is_ok());
        assert!(resolve_within_workspace(outside.to_string_lossy().as_ref(), &root, false).is_err());

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
        let stamp = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_millis();
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
        assert!(status.files.iter().any(|file| file.path == "tracked.txt" && file.additions > 0));
        assert!(status.files.iter().any(|file| file.path == "fresh.txt" && file.file_type.as_deref() == Some("add")));

        // Stage tracked edit, then restore both tracked + untracked.
        stage_one_path(&root, Path::new("tracked.txt")).unwrap();
        restore_one_path(&root, Path::new("tracked.txt")).unwrap();
        restore_one_path(&root, Path::new("fresh.txt")).unwrap();
        assert_eq!(fs::read_to_string(root.join("tracked.txt")).unwrap(), "one\n");
        assert!(!root.join("fresh.txt").exists());

        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn relative_paths_reject_parent_escape() {
        let stamp = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_millis();
        let root = std::env::temp_dir().join(format!("grok-forge-rel-{stamp}"));
        fs::create_dir_all(&root).unwrap();
        assert!(relative_in_workspace("ok.txt", &root).is_ok());
        assert!(relative_in_workspace("../outside.txt", &root).is_err());
        let _ = fs::remove_dir_all(&root);
    }
}
