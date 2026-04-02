use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::{mpsc, Arc, Mutex};
use std::thread::{self, JoinHandle};
use std::time::Duration;
use tauri::{AppHandle, Emitter, State};
use tiny_http::{Header, Method, Request, Response, Server, StatusCode};
use uuid::Uuid;

const MCP_PROTOCOL_VERSION: &str = "2025-03-26";
const MCP_SERVER_NAME: &str = "openscad-studio";
const MCP_DEFAULT_PORT: u16 = 32123;

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum McpServerStateKind {
    Starting,
    Running,
    Disabled,
    PortConflict,
    Error,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct McpServerStatus {
    enabled: bool,
    port: u16,
    status: McpServerStateKind,
    endpoint: Option<String>,
    message: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct FrontendToolRequest {
    request_id: String,
    tool_name: String,
    arguments: Value,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(tag = "type", rename_all = "lowercase")]
pub enum McpContentItem {
    Text {
        text: String,
    },
    #[serde(rename_all = "camelCase")]
    Image {
        data: String,
        mime_type: String,
    },
}

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct McpToolResponse {
    pub content: Vec<McpContentItem>,
    #[serde(default, skip_serializing_if = "is_false")]
    pub is_error: bool,
}

fn is_false(value: &bool) -> bool {
    !*value
}

struct RunningServer {
    shutdown_tx: mpsc::Sender<()>,
    join_handle: JoinHandle<()>,
}

struct McpStateInner {
    running_server: Option<RunningServer>,
    pending: HashMap<String, mpsc::Sender<McpToolResponse>>,
    status: McpServerStatus,
}

#[derive(Clone)]
pub struct McpServerState {
    inner: Arc<Mutex<McpStateInner>>,
}

impl Default for McpServerState {
    fn default() -> Self {
        Self {
            inner: Arc::new(Mutex::new(McpStateInner {
                running_server: None,
                pending: HashMap::new(),
                status: McpServerStatus {
                    enabled: true,
                    port: MCP_DEFAULT_PORT,
                    status: McpServerStateKind::Disabled,
                    endpoint: None,
                    message: None,
                },
            })),
        }
    }
}

fn endpoint_for_port(port: u16) -> String {
    format!("http://127.0.0.1:{port}/mcp")
}

fn build_status(
    enabled: bool,
    port: u16,
    status: McpServerStateKind,
    message: Option<String>,
) -> McpServerStatus {
    McpServerStatus {
        enabled,
        port,
        endpoint: if enabled {
            Some(endpoint_for_port(port))
        } else {
            None
        },
        status,
        message,
    }
}

fn header(name: &'static [u8], value: &'static [u8]) -> Header {
    Header::from_bytes(name, value).expect("valid static header")
}

fn text_tool_response(message: impl Into<String>, is_error: bool) -> McpToolResponse {
    McpToolResponse {
        content: vec![McpContentItem::Text {
            text: message.into(),
        }],
        is_error,
    }
}

fn json_response(status_code: u16, value: &Value) -> Response<std::io::Cursor<Vec<u8>>> {
    let mut response =
        Response::from_string(value.to_string()).with_status_code(StatusCode(status_code));
    response.add_header(header(b"content-type", b"application/json"));
    response.add_header(header(
        b"mcp-protocol-version",
        MCP_PROTOCOL_VERSION.as_bytes(),
    ));
    response
}

fn empty_response(status_code: u16) -> Response<std::io::Cursor<Vec<u8>>> {
    Response::from_data(Vec::<u8>::new()).with_status_code(StatusCode(status_code))
}

fn jsonrpc_result(id: Value, result: Value) -> Value {
    json!({
        "jsonrpc": "2.0",
        "id": id,
        "result": result,
    })
}

fn jsonrpc_error(id: Value, code: i64, message: impl Into<String>) -> Value {
    json!({
        "jsonrpc": "2.0",
        "id": id,
        "error": {
            "code": code,
            "message": message.into(),
        }
    })
}

fn remove_pending(
    inner: &Arc<Mutex<McpStateInner>>,
    request_id: &str,
) -> Option<mpsc::Sender<McpToolResponse>> {
    inner.lock().unwrap().pending.remove(request_id)
}

fn call_frontend_tool(
    app: &AppHandle,
    inner: &Arc<Mutex<McpStateInner>>,
    tool_name: &str,
    arguments: Value,
) -> Result<McpToolResponse, String> {
    let request_id = Uuid::new_v4().to_string();
    let (tx, rx) = mpsc::channel();

    inner.lock().unwrap().pending.insert(request_id.clone(), tx);

    let payload = FrontendToolRequest {
        request_id: request_id.clone(),
        tool_name: tool_name.to_string(),
        arguments,
    };

    if let Err(error) = app.emit("mcp:tool-request", payload) {
        remove_pending(inner, &request_id);
        return Err(format!("Failed to dispatch MCP tool request: {error}"));
    }

    match rx.recv_timeout(Duration::from_secs(30)) {
        Ok(response) => Ok(response),
        Err(mpsc::RecvTimeoutError::Timeout) => {
            remove_pending(inner, &request_id);
            Err("Timed out waiting for OpenSCAD Studio to complete the MCP tool request.".into())
        }
        Err(mpsc::RecvTimeoutError::Disconnected) => {
            remove_pending(inner, &request_id);
            Err("OpenSCAD Studio could not deliver the MCP tool response.".into())
        }
    }
}

fn tool_definitions() -> Value {
    json!([
        {
            "name": "get_project_context",
            "description": "Get the current OpenSCAD Studio render target and workspace summary.",
            "inputSchema": {
                "type": "object",
                "properties": {},
                "additionalProperties": false
            }
        },
        {
            "name": "set_render_target",
            "description": "Change which workspace-relative file Studio compiles and previews.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "file_path": {
                        "type": "string",
                        "description": "Workspace-relative .scad path to use as the render target."
                    }
                },
                "required": ["file_path"],
                "additionalProperties": false
            }
        },
        {
            "name": "get_diagnostics",
            "description": "Render the current Studio render target and return the latest diagnostics.",
            "inputSchema": {
                "type": "object",
                "properties": {},
                "additionalProperties": false
            }
        },
        {
            "name": "trigger_render",
            "description": "Render the current Studio render target and refresh the preview.",
            "inputSchema": {
                "type": "object",
                "properties": {},
                "additionalProperties": false
            }
        },
        {
            "name": "get_preview_screenshot",
            "description": "Capture a PNG screenshot of Studio's current preview.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "view": {
                        "type": "string",
                        "enum": ["current", "front", "back", "top", "bottom", "left", "right", "isometric"]
                    },
                    "azimuth": { "type": "number" },
                    "elevation": { "type": "number" }
                },
                "additionalProperties": false
            }
        }
    ])
}

fn handle_rpc_message(
    app: &AppHandle,
    inner: &Arc<Mutex<McpStateInner>>,
    payload: Value,
) -> Result<Option<Value>, Value> {
    let id = payload.get("id").cloned().unwrap_or(Value::Null);
    let Some(method) = payload.get("method").and_then(Value::as_str) else {
        return Err(jsonrpc_error(id, -32600, "Missing JSON-RPC method."));
    };

    let params = payload.get("params").cloned().unwrap_or_else(|| json!({}));

    match method {
        "initialize" => Ok(Some(jsonrpc_result(
            id,
            json!({
                "protocolVersion": MCP_PROTOCOL_VERSION,
                "capabilities": {
                    "tools": {}
                },
                "serverInfo": {
                    "name": MCP_SERVER_NAME,
                    "version": env!("CARGO_PKG_VERSION")
                }
            }),
        ))),
        "notifications/initialized" => Ok(None),
        "ping" => Ok(Some(jsonrpc_result(id, json!({})))),
        "tools/list" => Ok(Some(jsonrpc_result(
            id,
            json!({
                "tools": tool_definitions()
            }),
        ))),
        "tools/call" => {
            let Some(name) = params.get("name").and_then(Value::as_str) else {
                return Err(jsonrpc_error(
                    id,
                    -32602,
                    "`tools/call` requires a string `name` parameter.",
                ));
            };

            let arguments = params
                .get("arguments")
                .cloned()
                .unwrap_or_else(|| Value::Object(Default::default()));

            let result = call_frontend_tool(app, inner, name, arguments).map_err(|message| {
                jsonrpc_result(id.clone(), json!(text_tool_response(message, true)))
            })?;

            Ok(Some(jsonrpc_result(
                id,
                serde_json::to_value(result).expect("serializable MCP tool response"),
            )))
        }
        _ => Err(jsonrpc_error(
            id,
            -32601,
            format!("Method not found: {method}"),
        )),
    }
}

fn respond_to_request(mut request: Request, app: &AppHandle, inner: &Arc<Mutex<McpStateInner>>) {
    if request.method() != &Method::Post {
        let _ = request.respond(empty_response(405));
        return;
    }

    if request.url() != "/mcp" {
        let _ = request.respond(empty_response(404));
        return;
    }

    let mut body = String::new();
    if request.as_reader().read_to_string(&mut body).is_err() {
        let _ = request.respond(json_response(
            400,
            &jsonrpc_error(Value::Null, -32700, "Failed to read request body."),
        ));
        return;
    }

    let payload: Value = match serde_json::from_str(&body) {
        Ok(value) => value,
        Err(error) => {
            let _ = request.respond(json_response(
                400,
                &jsonrpc_error(
                    Value::Null,
                    -32700,
                    format!("Invalid JSON payload: {error}"),
                ),
            ));
            return;
        }
    };

    if payload.is_array() {
        let _ = request.respond(json_response(
            400,
            &jsonrpc_error(Value::Null, -32600, "Batch requests are not supported."),
        ));
        return;
    }

    match handle_rpc_message(app, inner, payload) {
        Ok(Some(response)) => {
            let _ = request.respond(json_response(200, &response));
        }
        Ok(None) => {
            let _ = request.respond(empty_response(202));
        }
        Err(error) => {
            let _ = request.respond(json_response(400, &error));
        }
    }
}

fn run_mcp_server(
    server: Server,
    shutdown_rx: mpsc::Receiver<()>,
    app: AppHandle,
    inner: Arc<Mutex<McpStateInner>>,
) {
    loop {
        if shutdown_rx.try_recv().is_ok() {
            break;
        }

        match server.recv_timeout(Duration::from_millis(200)) {
            Ok(Some(request)) => respond_to_request(request, &app, &inner),
            Ok(None) => {}
            Err(error) => {
                inner.lock().unwrap().status = build_status(
                    true,
                    inner.lock().unwrap().status.port,
                    McpServerStateKind::Error,
                    Some(format!("MCP server stopped unexpectedly: {error}")),
                );
                break;
            }
        }
    }
}

fn stop_running_server(running_server: Option<RunningServer>) {
    if let Some(server) = running_server {
        let _ = server.shutdown_tx.send(());
        let _ = server.join_handle.join();
    }
}

#[tauri::command]
pub fn configure_mcp_server(
    app: AppHandle,
    enabled: bool,
    port: u16,
    state: State<'_, McpServerState>,
) -> Result<McpServerStatus, String> {
    let previous_server = {
        let mut inner = state.inner.lock().unwrap();
        inner.status = build_status(
            enabled,
            port,
            if enabled {
                McpServerStateKind::Starting
            } else {
                McpServerStateKind::Disabled
            },
            None,
        );
        inner.running_server.take()
    };

    stop_running_server(previous_server);

    if !enabled {
        let mut inner = state.inner.lock().unwrap();
        inner.status = build_status(false, port, McpServerStateKind::Disabled, None);
        return Ok(inner.status.clone());
    }

    let address = format!("127.0.0.1:{port}");
    let server = match Server::http(&address) {
        Ok(server) => server,
        Err(error) => {
            let kind = if error
                .to_string()
                .to_lowercase()
                .contains("address already in use")
            {
                McpServerStateKind::PortConflict
            } else {
                McpServerStateKind::Error
            };
            let mut inner = state.inner.lock().unwrap();
            inner.status = build_status(enabled, port, kind, Some(error.to_string()));
            return Ok(inner.status.clone());
        }
    };

    let (shutdown_tx, shutdown_rx) = mpsc::channel();
    let inner = state.inner.clone();
    let app_handle = app.clone();
    let join_handle = thread::spawn(move || run_mcp_server(server, shutdown_rx, app_handle, inner));

    let mut inner = state.inner.lock().unwrap();
    inner.running_server = Some(RunningServer {
        shutdown_tx,
        join_handle,
    });
    inner.status = build_status(enabled, port, McpServerStateKind::Running, None);
    Ok(inner.status.clone())
}

#[tauri::command]
pub fn get_mcp_server_status(state: State<'_, McpServerState>) -> Result<McpServerStatus, String> {
    Ok(state.inner.lock().unwrap().status.clone())
}

#[tauri::command]
pub fn mcp_submit_tool_response(
    request_id: String,
    response: McpToolResponse,
    state: State<'_, McpServerState>,
) -> Result<(), String> {
    let sender = state.inner.lock().unwrap().pending.remove(&request_id);
    let Some(sender) = sender else {
        return Err(format!(
            "No pending MCP tool request found for {request_id}."
        ));
    };

    sender
        .send(response)
        .map_err(|error| format!("Failed to send MCP tool response: {error}"))
}

pub fn shutdown_mcp_server(state: &McpServerState) {
    let running_server = {
        let mut inner = state.inner.lock().unwrap();
        inner.status = build_status(false, inner.status.port, McpServerStateKind::Disabled, None);
        inner.running_server.take()
    };
    stop_running_server(running_server);
}
