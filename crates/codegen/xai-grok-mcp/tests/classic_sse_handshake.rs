//! Integration test for classic MCP HTTP+SSE transport.
//!
//! Fake server mirrors JetBrains IDEA MCP:
//! - GET /sse → `event: endpoint` + standing stream
//! - POST /message?sessionId=… → 202 Accepted
//! - JSON-RPC responses delivered as SSE `event: message` frames

use std::collections::HashMap;
use std::sync::Arc;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::time::Duration;

use axum::body::Body;
use axum::extract::{Query, State};
use axum::http::{StatusCode, header};
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use futures::stream::{self, StreamExt};
use serde_json::{Value, json};
use tokio::sync::mpsc;

use xai_grok_mcp::servers::{HttpConfig, McpClient, McpClientTimeoutOverrides};

#[derive(Clone)]
struct FakeState {
    sessions: Arc<tokio::sync::Mutex<HashMap<String, mpsc::UnboundedSender<String>>>>,
    posts: Arc<AtomicUsize>,
}

async fn handle_sse(State(state): State<FakeState>) -> Response {
    let session_id = uuid_lite();
    let (tx, rx) = mpsc::unbounded_channel::<String>();
    {
        let mut map = state.sessions.lock().await;
        map.insert(session_id.clone(), tx);
    }

    let endpoint = format!("/message?sessionId={session_id}");
    let intro = format!("event: endpoint\ndata: {endpoint}\n\n");

    // intro frame, then frames from the post handler, plus keepalives
    let stream = stream::once(async move { Ok::<_, std::io::Error>(intro) }).chain(
        stream::unfold(rx, |mut rx| async move {
            match rx.recv().await {
                Some(frame) => Some((Ok(frame), rx)),
                None => None,
            }
        }),
    );

    (
        [(header::CONTENT_TYPE, "text/event-stream")],
        Body::from_stream(stream),
    )
        .into_response()
}

async fn handle_message(
    State(state): State<FakeState>,
    Query(q): Query<HashMap<String, String>>,
    body: axum::Json<Value>,
) -> Response {
    state.posts.fetch_add(1, Ordering::Relaxed);
    let session_id = q.get("sessionId").cloned().unwrap_or_default();
    let req = body.0;
    let id = req.get("id").cloned();
    let method = req.get("method").and_then(|m| m.as_str()).unwrap_or("");

    let reply = match method {
        "initialize" => {
            let pv = req
                .pointer("/params/protocolVersion")
                .cloned()
                .unwrap_or_else(|| json!("2024-11-05"));
            json!({
                "jsonrpc": "2.0",
                "id": id,
                "result": {
                    "protocolVersion": pv,
                    "capabilities": {},
                    "serverInfo": {"name": "fake-classic-sse", "version": "0.0.1"},
                }
            })
        }
        "tools/list" => json!({
            "jsonrpc": "2.0",
            "id": id,
            "result": {
                "tools": [{
                    "name": "ping",
                    "description": "ping",
                    "inputSchema": {"type": "object", "properties": {}}
                }]
            }
        }),
        "notifications/initialized" | "notifications/cancelled" => {
            return StatusCode::ACCEPTED.into_response();
        }
        _ => {
            if id.is_none() {
                return StatusCode::ACCEPTED.into_response();
            }
            json!({
                "jsonrpc": "2.0",
                "id": id,
                "result": {}
            })
        }
    };

    let frame = format!("event: message\ndata: {}\n\n", reply);
    if let Some(tx) = state.sessions.lock().await.get(&session_id) {
        let _ = tx.send(frame);
    }

    (StatusCode::ACCEPTED, "Accepted").into_response()
}

fn uuid_lite() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let t = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    format!("sess-{t}")
}

async fn spawn_classic_sse_server() -> (String, Arc<AtomicUsize>) {
    let posts = Arc::new(AtomicUsize::new(0));
    let state = FakeState {
        sessions: Arc::new(tokio::sync::Mutex::new(HashMap::new())),
        posts: posts.clone(),
    };
    let app = axum::Router::new()
        .route("/sse", get(handle_sse))
        .route("/message", post(handle_message))
        .with_state(state);
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
        .await
        .expect("bind");
    let addr = listener.local_addr().expect("addr");
    tokio::spawn(async move {
        let _ = axum::serve(listener, app).await;
    });
    // tiny settle so accept loop is ready
    tokio::time::sleep(Duration::from_millis(20)).await;
    (format!("http://{addr}/sse"), posts)
}

#[tokio::test(flavor = "multi_thread")]
async fn classic_sse_handshake_and_tools_list() {
    let (url, posts) = spawn_classic_sse_server().await;
    let overrides = McpClientTimeoutOverrides {
        startup_timeout_sec: Some(10),
        tool_timeout_sec: Some(10),
        ..Default::default()
    };
    let client = McpClient::new_sse(
        "idea-fake".to_string(),
        HttpConfig {
            url,
            headers: vec![],
        },
        Some(&overrides),
        None,
    );

    let service = client
        .ensure_initialized()
        .await
        .expect("classic SSE handshake should succeed");

    let tools = service
        .list_tools(Default::default())
        .await
        .expect("tools/list");
    assert_eq!(tools.tools.len(), 1);
    assert_eq!(tools.tools[0].name.as_ref(), "ping");
    assert!(
        posts.load(Ordering::Relaxed) >= 2,
        "initialize + tools/list should POST at least twice, got {}",
        posts.load(Ordering::Relaxed)
    );
}
