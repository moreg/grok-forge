//! Classic MCP SSE client transport (pre-streamable-HTTP).
//!
//! Protocol (MCP 2024-11-05 "HTTP+SSE"):
//! 1. Client opens a standing `GET` on the SSE URL (`…/sse`).
//! 2. Server emits `event: endpoint` with a message path
//!    (e.g. `/message?sessionId=…`).
//! 3. Client `POST`s every JSON-RPC message to that endpoint.
//! 4. Server may answer POSTs with `202 Accepted`; responses / notifications
//!    arrive as SSE `event: message` (or bare `data:`) frames on the GET stream.
//!
//! rmcp 2.x only ships streamable-HTTP, which `POST`s `initialize` at the SSE
//! URL itself and fails against JetBrains / classic servers with HTTP 405.
//! This module restores classic SSE for [`acp::McpServer::Sse`] configs.

use std::sync::Arc;
use std::time::Duration;

use futures::StreamExt;
use futures::stream::BoxStream;
use rmcp::service::{RoleClient, RxJsonRpcMessage, TxJsonRpcMessage};
use rmcp::transport::Transport;
use sse_stream::{Sse, SseStream};
use thiserror::Error;
use tokio::sync::mpsc;
use tokio_util::sync::CancellationToken;
use url::Url;

/// Default time to wait for the first `endpoint` event after opening GET.
const ENDPOINT_WAIT: Duration = Duration::from_secs(15);

/// Connection parameters for classic SSE (mirrors HTTP MCP config fields).
pub struct ClassicSseConfig {
    pub url: String,
    pub headers: Vec<(String, String)>,
}

/// Classic SSE client transport implementing rmcp's [`Transport`] trait.
pub struct ClassicSseClientTransport {
    http: reqwest::Client,
    post_url: Arc<String>,
    /// Dual-mode: some servers also put JSON-RPC responses in the POST body.
    incoming_tx: mpsc::Sender<RxJsonRpcMessage<RoleClient>>,
    incoming_rx: mpsc::Receiver<RxJsonRpcMessage<RoleClient>>,
    cancel: CancellationToken,
}

#[derive(Debug, Error)]
pub enum ClassicSseError {
    #[error("HTTP error: {0}")]
    Http(#[from] reqwest::Error),
    #[error("SSE endpoint discovery failed: {0}")]
    Endpoint(String),
    #[error("invalid SSE URL: {0}")]
    InvalidUrl(String),
    #[error("POST to message endpoint failed with HTTP {status}: {body}")]
    PostStatus { status: u16, body: String },
    #[error("failed to serialize JSON-RPC message: {0}")]
    Serialize(#[from] serde_json::Error),
    #[error("transport closed")]
    Closed,
}

type SseFrameStream = BoxStream<'static, Result<Sse, String>>;

impl ClassicSseClientTransport {
    /// Open the SSE stream, wait for `endpoint`, and start the receive pump.
    pub async fn connect(
        config: &ClassicSseConfig,
        server_name: &str,
    ) -> Result<Self, ClassicSseError> {
        let sse_url = Url::parse(&config.url)
            .map_err(|e| ClassicSseError::InvalidUrl(format!("{}: {e}", config.url)))?;

        let mut headers = reqwest::header::HeaderMap::new();
        for (key, value) in &config.headers {
            match (
                reqwest::header::HeaderName::from_bytes(key.as_bytes()),
                value.parse::<reqwest::header::HeaderValue>(),
            ) {
                (Ok(name), Ok(val)) => {
                    headers.insert(name, val);
                }
                _ => {
                    tracing::warn!(
                        server = %server_name,
                        header = %key,
                        "Skipping invalid classic-SSE header"
                    );
                }
            }
        }
        headers.insert(
            reqwest::header::ACCEPT,
            reqwest::header::HeaderValue::from_static("text/event-stream"),
        );

        let http = reqwest::Client::builder()
            .default_headers(headers)
            .build()?;

        let response = http
            .get(sse_url.as_str())
            .send()
            .await?
            .error_for_status()?;

        // sse-stream 0.2.1 names this `from_byte_stream` (typo fixed in later
        // releases as `from_bytes_stream`); pin to the method present in tree.
        let mut sse: SseFrameStream = Box::pin(
            SseStream::from_byte_stream(response.bytes_stream())
                .map(|item: Result<Sse, _>| item.map_err(|e| e.to_string())),
        );

        let post_url = tokio::time::timeout(ENDPOINT_WAIT, wait_for_endpoint(&mut sse, &sse_url))
            .await
            .map_err(|_| {
                ClassicSseError::Endpoint(format!(
                    "timed out after {}s waiting for endpoint event from {}",
                    ENDPOINT_WAIT.as_secs(),
                    config.url
                ))
            })??;

        tracing::info!(
            server = %server_name,
            sse = %config.url,
            post = %post_url,
            "Classic MCP SSE connected"
        );

        let (incoming_tx, incoming_rx) = mpsc::channel(64);
        let cancel = CancellationToken::new();
        let pump_tx = incoming_tx.clone();
        let pump_cancel = cancel.clone();
        let pump_server = server_name.to_string();
        tokio::spawn(async move {
            pump_sse_messages(sse, pump_tx, pump_cancel, pump_server).await;
        });

        Ok(Self {
            http,
            post_url: Arc::new(post_url),
            incoming_tx,
            incoming_rx,
            cancel,
        })
    }
}

/// Read SSE frames until `event: endpoint` (or a bare path that looks like one).
async fn wait_for_endpoint(
    sse: &mut SseFrameStream,
    sse_url: &Url,
) -> Result<String, ClassicSseError> {
    while let Some(frame) = sse.next().await {
        let frame = frame.map_err(ClassicSseError::Endpoint)?;
        let event = frame.event.as_deref().unwrap_or("");
        let data = frame.data.as_deref().unwrap_or("").trim();
        if data.is_empty() {
            continue;
        }
        // Spec: event name is "endpoint". Some servers omit the event field.
        if event == "endpoint" || (event.is_empty() && looks_like_endpoint_path(data)) {
            return resolve_post_url(sse_url, data);
        }
    }
    Err(ClassicSseError::Endpoint(
        "SSE stream ended before endpoint event".into(),
    ))
}

fn looks_like_endpoint_path(data: &str) -> bool {
    data.starts_with('/')
        || data.starts_with("http://")
        || data.starts_with("https://")
        || data.contains("sessionId=")
        || data.contains("/message")
}

fn resolve_post_url(sse_url: &Url, data: &str) -> Result<String, ClassicSseError> {
    let data = data.trim();
    if data.starts_with("http://") || data.starts_with("https://") {
        return Ok(data.to_string());
    }
    // Relative path: join against origin (scheme + host[:port]), not the full
    // SSE path — `/message?…` must replace `/sse`, not nest under it.
    let origin = origin_of(sse_url)?;
    let path = if data.starts_with('/') {
        data.to_string()
    } else {
        format!("/{data}")
    };
    Ok(format!("{origin}{path}"))
}

fn origin_of(url: &Url) -> Result<String, ClassicSseError> {
    let scheme = url.scheme();
    let host = url
        .host_str()
        .ok_or_else(|| ClassicSseError::InvalidUrl(url.to_string()))?;
    match url.port() {
        Some(p) => Ok(format!("{scheme}://{host}:{p}")),
        None => Ok(format!("{scheme}://{host}")),
    }
}

async fn pump_sse_messages(
    mut sse: SseFrameStream,
    tx: mpsc::Sender<RxJsonRpcMessage<RoleClient>>,
    cancel: CancellationToken,
    server_name: String,
) {
    loop {
        tokio::select! {
            _ = cancel.cancelled() => break,
            frame = sse.next() => {
                match frame {
                    None => break,
                    Some(Err(e)) => {
                        tracing::warn!(
                            server = %server_name,
                            error = %e,
                            "Classic SSE stream error; closing receive pump"
                        );
                        break;
                    }
                    Some(Ok(frame)) => {
                        if let Some(msg) = parse_sse_jsonrpc(&frame) {
                            if tx.send(msg).await.is_err() {
                                break;
                            }
                        }
                    }
                }
            }
        }
    }
}

fn parse_sse_jsonrpc(frame: &Sse) -> Option<RxJsonRpcMessage<RoleClient>> {
    let event = frame.event.as_deref().unwrap_or("");
    // After the endpoint handshake, frames are typically `event: message`
    // or bare data. Ignore further endpoint / keepalive comments.
    if event == "endpoint" {
        return None;
    }
    let data = frame.data.as_deref()?.trim();
    if data.is_empty() {
        return None;
    }
    if !data.starts_with('{') {
        return None;
    }
    match serde_json::from_str::<RxJsonRpcMessage<RoleClient>>(data) {
        Ok(msg) => Some(msg),
        Err(e) => {
            tracing::debug!(
                error = %e,
                sample = %data.chars().take(120).collect::<String>(),
                "Skipping non-JSON-RPC SSE frame"
            );
            None
        }
    }
}

impl Transport<RoleClient> for ClassicSseClientTransport {
    type Error = ClassicSseError;

    fn send(
        &mut self,
        item: TxJsonRpcMessage<RoleClient>,
    ) -> impl Future<Output = Result<(), Self::Error>> + Send + 'static {
        let http = self.http.clone();
        let post_url = Arc::clone(&self.post_url);
        let incoming_tx = self.incoming_tx.clone();
        async move {
            let body = serde_json::to_vec(&item)?;
            let response = http
                .post(post_url.as_str())
                .header(reqwest::header::CONTENT_TYPE, "application/json")
                .header(
                    reqwest::header::ACCEPT,
                    "application/json, text/event-stream",
                )
                .body(body)
                .send()
                .await?;

            let status = response.status();
            if !(status.is_success() || status.as_u16() == 202) {
                let body = response.text().await.unwrap_or_default();
                return Err(ClassicSseError::PostStatus {
                    status: status.as_u16(),
                    body: body.chars().take(200).collect(),
                });
            }

            // Dual-mode: if the server embeds a JSON-RPC response in the POST
            // body (some classic implementations do), enqueue it. JetBrains
            // returns 202 + "Accepted" — ignore non-JSON bodies.
            if let Ok(bytes) = response.bytes().await {
                let trimmed = trim_ascii(bytes.as_ref());
                if trimmed.starts_with(b"{") {
                    if let Ok(msg) =
                        serde_json::from_slice::<RxJsonRpcMessage<RoleClient>>(trimmed)
                    {
                        let _ = incoming_tx.send(msg).await;
                    }
                }
            }
            Ok(())
        }
    }

    fn receive(&mut self) -> impl Future<Output = Option<RxJsonRpcMessage<RoleClient>>> + Send {
        async { self.incoming_rx.recv().await }
    }

    async fn close(&mut self) -> Result<(), Self::Error> {
        self.cancel.cancel();
        self.incoming_rx.close();
        Ok(())
    }
}

fn trim_ascii(bytes: &[u8]) -> &[u8] {
    let start = bytes
        .iter()
        .position(|b| !b.is_ascii_whitespace())
        .unwrap_or(bytes.len());
    let end = bytes
        .iter()
        .rposition(|b| !b.is_ascii_whitespace())
        .map(|i| i + 1)
        .unwrap_or(0);
    if start >= end {
        &[]
    } else {
        &bytes[start..end]
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolve_post_url_absolute() {
        let sse = Url::parse("http://127.0.0.1:64342/sse").unwrap();
        let got = resolve_post_url(&sse, "http://127.0.0.1:64342/message?sessionId=abc").unwrap();
        assert_eq!(got, "http://127.0.0.1:64342/message?sessionId=abc");
    }

    #[test]
    fn resolve_post_url_relative() {
        let sse = Url::parse("http://127.0.0.1:64342/sse").unwrap();
        let got = resolve_post_url(&sse, "/message?sessionId=abc").unwrap();
        assert_eq!(got, "http://127.0.0.1:64342/message?sessionId=abc");
    }

    #[test]
    fn looks_like_endpoint_path_detects_message() {
        assert!(looks_like_endpoint_path("/message?sessionId=x"));
        assert!(!looks_like_endpoint_path(r#"{"jsonrpc":"2.0"}"#));
    }
}
