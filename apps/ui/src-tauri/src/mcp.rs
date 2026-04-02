use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::fs;
use std::sync::{mpsc, Arc, Mutex};
use std::thread::{self, JoinHandle};
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager, State, Window};
use tiny_http::{Header, Method, Request, Response, Server, StatusCode};
use uuid::Uuid;

const MCP_PROTOCOL_VERSION: &str = "2025-03-26";
const MCP_SERVER_NAME: &str = "openscad-studio";
const MCP_DEFAULT_PORT: u16 = 32123;
const MCP_SESSION_HEADER: &str = "mcp-session-id";

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

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceDescriptor {
    pub window_id: String,
    pub title: String,
    pub workspace_root: Option<String>,
    pub render_target_path: Option<String>,
    pub is_focused: bool,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WindowContextPayload {
    pub title: Option<String>,
    pub workspace_root: Option<String>,
    pub render_target_path: Option<String>,
    #[serde(default = "default_true")]
    pub ready: bool,
}

#[derive(Clone, Debug)]
struct RegisteredWorkspace {
    descriptor: WorkspaceDescriptor,
    ready: bool,
    last_focused_order: u64,
}

#[derive(Clone, Debug, Default)]
struct McpSessionBinding {
    bound_window_id: Option<String>,
}

fn default_true() -> bool {
    true
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
    workspaces: HashMap<String, RegisteredWorkspace>,
    sessions: HashMap<String, McpSessionBinding>,
    next_focus_order: u64,
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
                workspaces: HashMap::new(),
                sessions: HashMap::new(),
                next_focus_order: 0,
            })),
        }
    }
}

struct RpcOutcome {
    response: Option<Value>,
    session_id: Option<String>,
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

fn static_header(name: &'static [u8], value: &'static [u8]) -> Header {
    Header::from_bytes(name, value).expect("valid static header")
}

fn dynamic_header(name: &str, value: &str) -> Header {
    Header::from_bytes(name.as_bytes(), value.as_bytes()).expect("valid dynamic header")
}

fn text_tool_response(message: impl Into<String>, is_error: bool) -> McpToolResponse {
    McpToolResponse {
        content: vec![McpContentItem::Text {
            text: message.into(),
        }],
        is_error,
    }
}

fn json_response(
    status_code: u16,
    value: &Value,
    session_id: Option<&str>,
) -> Response<std::io::Cursor<Vec<u8>>> {
    let mut response =
        Response::from_string(value.to_string()).with_status_code(StatusCode(status_code));
    response.add_header(static_header(b"content-type", b"application/json"));
    response.add_header(static_header(
        b"mcp-protocol-version",
        MCP_PROTOCOL_VERSION.as_bytes(),
    ));
    if let Some(session_id) = session_id {
        response.add_header(dynamic_header(MCP_SESSION_HEADER, session_id));
    }
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

fn normalize_workspace_root(path: &str) -> Option<String> {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return None;
    }

    fs::canonicalize(trimmed)
        .ok()
        .and_then(|resolved| resolved.into_os_string().into_string().ok())
}

fn remove_pending(
    inner: &Arc<Mutex<McpStateInner>>,
    request_id: &str,
) -> Option<mpsc::Sender<McpToolResponse>> {
    inner.lock().unwrap().pending.remove(request_id)
}

fn list_open_workspaces_locked(inner: &McpStateInner) -> Vec<WorkspaceDescriptor> {
    let mut workspaces: Vec<_> = inner.workspaces.values().cloned().collect();
    workspaces.sort_by(|a, b| {
        b.descriptor
            .is_focused
            .cmp(&a.descriptor.is_focused)
            .then_with(|| b.last_focused_order.cmp(&a.last_focused_order))
            .then_with(|| a.descriptor.title.cmp(&b.descriptor.title))
            .then_with(|| a.descriptor.window_id.cmp(&b.descriptor.window_id))
    });
    workspaces
        .into_iter()
        .map(|entry| entry.descriptor)
        .collect()
}

fn format_workspace_list(workspaces: &[WorkspaceDescriptor]) -> String {
    if workspaces.is_empty() {
        return "No OpenSCAD Studio windows are currently available for MCP binding.".into();
    }

    let lines = workspaces
        .iter()
        .map(|workspace| {
            let root = workspace
                .workspace_root
                .clone()
                .unwrap_or_else(|| "(no workspace root)".into());
            let render_target = workspace
                .render_target_path
                .clone()
                .unwrap_or_else(|| "(no render target)".into());
            let focused = if workspace.is_focused { "yes" } else { "no" };
            format!(
                "- window_id: {}\n  title: {}\n  workspace_root: {}\n  render_target_path: {}\n  focused: {}",
                workspace.window_id, workspace.title, root, render_target, focused
            )
        })
        .collect::<Vec<_>>()
        .join("\n");

    format!("Open OpenSCAD Studio workspaces:\n{lines}")
}

fn ensure_session_id(inner: &mut McpStateInner, existing_session_id: Option<String>) -> String {
    let session_id = existing_session_id.unwrap_or_else(|| Uuid::new_v4().to_string());
    inner.sessions.entry(session_id.clone()).or_default();
    session_id
}

fn remove_window_and_invalidate_sessions_locked(inner: &mut McpStateInner, window_id: &str) {
    inner.workspaces.remove(window_id);
    for session in inner.sessions.values_mut() {
        if session.bound_window_id.as_deref() == Some(window_id) {
            session.bound_window_id = None;
        }
    }
}

fn require_bound_window_id(
    inner: &mut McpStateInner,
    session_id: &str,
) -> Result<String, McpToolResponse> {
    let Some(session) = inner.sessions.get_mut(session_id) else {
        return Err(text_tool_response(
            "This MCP session is not initialized. Reconnect your client and call `select_workspace` before using Studio render tools.",
            true,
        ));
    };

    let Some(window_id) = session.bound_window_id.clone() else {
        let workspaces = list_open_workspaces_locked(inner);
        return Err(text_tool_response(
            format!(
                "No OpenSCAD Studio workspace is selected for this MCP session.\n\nCall `select_workspace` with a `workspace_root` or `window_id` first.\n\n{}",
                format_workspace_list(&workspaces)
            ),
            true,
        ));
    };

    match inner.workspaces.get(&window_id) {
        Some(workspace) if workspace.ready => Ok(window_id),
        Some(_) => Err(text_tool_response(
            format!(
                "The selected Studio window `{window_id}` is not ready for MCP requests yet. Wait a moment and try again."
            ),
            true,
        )),
        None => {
            session.bound_window_id = None;
            let workspaces = list_open_workspaces_locked(inner);
            Err(text_tool_response(
                format!(
                    "The previously selected Studio window `{window_id}` is no longer available. Call `select_workspace` again.\n\n{}",
                    format_workspace_list(&workspaces)
                ),
                true,
            ))
        }
    }
}

fn call_frontend_tool(
    app: &AppHandle,
    inner: &Arc<Mutex<McpStateInner>>,
    window_id: &str,
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

    let Some(window) = app.get_webview_window(window_id) else {
        remove_pending(inner, &request_id);
        return Err(format!(
            "OpenSCAD Studio window `{window_id}` is no longer available."
        ));
    };

    if let Err(error) = window.emit("mcp:tool-request", payload) {
        remove_pending(inner, &request_id);
        return Err(format!(
            "Failed to dispatch MCP tool request to OpenSCAD Studio window `{window_id}`: {error}"
        ));
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
            "name": "list_open_workspaces",
            "description": "List the currently open OpenSCAD Studio windows that can be selected for this MCP session.",
            "inputSchema": {
                "type": "object",
                "properties": {},
                "additionalProperties": false
            }
        },
        {
            "name": "select_workspace",
            "description": "Bind this MCP session to an open OpenSCAD Studio workspace by exact workspace root or explicit window id.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "workspace_root": {
                        "type": "string",
                        "description": "Exact absolute workspace root path already open in OpenSCAD Studio."
                    },
                    "window_id": {
                        "type": "string",
                        "description": "Explicit OpenSCAD Studio window id from list_open_workspaces()."
                    }
                },
                "additionalProperties": false
            }
        },
        {
            "name": "get_project_context",
            "description": "Get the current OpenSCAD Studio render target and workspace summary for the selected workspace.",
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
        },
        {
            "name": "export_file",
            "description": "Export the current render target to a file path on desktop.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "format": {
                        "type": "string",
                        "enum": ["stl", "obj", "amf", "3mf", "svg", "dxf"]
                    },
                    "file_path": {
                        "type": "string",
                        "description": "Absolute output path, or a project-relative path when a workspace root is open."
                    }
                },
                "required": ["format", "file_path"],
                "additionalProperties": false
            }
        }
    ])
}

fn list_open_workspaces_response(inner: &McpStateInner) -> McpToolResponse {
    let workspaces = list_open_workspaces_locked(inner);
    text_tool_response(format_workspace_list(&workspaces), false)
}

fn select_workspace_response(
    inner: &mut McpStateInner,
    session_id: &str,
    arguments: &Value,
) -> McpToolResponse {
    let workspace_root = arguments
        .get("workspace_root")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty());
    let window_id = arguments
        .get("window_id")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty());

    let selected_window_id = if let Some(window_id) = window_id {
        match inner.workspaces.get(window_id) {
            Some(_) => window_id.to_string(),
            None => {
                return text_tool_response(
                    format!(
                        "No open OpenSCAD Studio window matches `window_id` `{window_id}`.\n\n{}",
                        format_workspace_list(&list_open_workspaces_locked(inner))
                    ),
                    true,
                )
            }
        }
    } else if let Some(workspace_root) = workspace_root {
        let Some(normalized_root) = normalize_workspace_root(workspace_root) else {
            return text_tool_response(
                format!("Could not resolve workspace root `{workspace_root}`."),
                true,
            );
        };

        let matches: Vec<_> = inner
            .workspaces
            .values()
            .filter(|workspace| {
                workspace.descriptor.workspace_root.as_deref() == Some(normalized_root.as_str())
            })
            .map(|workspace| workspace.descriptor.clone())
            .collect();

        match matches.len() {
            0 => {
                return text_tool_response(
                    format!(
                        "No open OpenSCAD Studio workspace matches `{normalized_root}`.\n\n{}",
                        format_workspace_list(&list_open_workspaces_locked(inner))
                    ),
                    true,
                )
            }
            1 => matches[0].window_id.clone(),
            _ => {
                let options = matches
                    .iter()
                    .map(|workspace| format!("- {} ({})", workspace.window_id, workspace.title))
                    .collect::<Vec<_>>()
                    .join("\n");
                return text_tool_response(
                    format!(
                        "Multiple OpenSCAD Studio windows are open for `{normalized_root}`. Re-run `select_workspace` with a `window_id`.\n\n{options}"
                    ),
                    true,
                );
            }
        }
    } else {
        return text_tool_response(
            "select_workspace requires either `workspace_root` or `window_id`.",
            true,
        );
    };

    inner
        .sessions
        .entry(session_id.to_string())
        .or_default()
        .bound_window_id = Some(selected_window_id.clone());

    let workspace = inner
        .workspaces
        .get(&selected_window_id)
        .map(|workspace| workspace.descriptor.clone());

    if let Some(workspace) = workspace {
        let root = workspace
            .workspace_root
            .unwrap_or_else(|| "(no workspace root)".into());
        let render_target = workspace
            .render_target_path
            .unwrap_or_else(|| "(no render target)".into());
        text_tool_response(
            format!(
                "✅ Bound this MCP session to OpenSCAD Studio window `{}`.\n\nWorkspace root: {}\nRender target: {}",
                workspace.window_id, root, render_target
            ),
            false,
        )
    } else {
        text_tool_response(
            format!("The selected Studio window `{selected_window_id}` is no longer available."),
            true,
        )
    }
}

fn handle_tool_call(
    app: &AppHandle,
    inner: &Arc<Mutex<McpStateInner>>,
    session_id: Option<String>,
    params: Value,
    id: Value,
) -> Result<RpcOutcome, Value> {
    let session_id_for_response = session_id.clone();
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

    let result = match name {
        "list_open_workspaces" => {
            let inner = inner.lock().unwrap();
            list_open_workspaces_response(&inner)
        }
        "select_workspace" => {
            match session_id.as_deref() {
                Some(session_id) => {
                    let mut inner = inner.lock().unwrap();
                    select_workspace_response(&mut inner, session_id, &arguments)
                }
                None => text_tool_response(
                    "This MCP request does not have a session id yet. Reconnect your MCP client and retry workspace selection.",
                    true,
                ),
            }
        }
        "get_project_context" => {
            let maybe_window_id = {
                let mut inner = inner.lock().unwrap();
                match session_id.as_deref() {
                    Some(session_id) => match require_bound_window_id(&mut inner, session_id) {
                        Ok(window_id) => Some(window_id),
                        Err(response) => return Ok(RpcOutcome {
                            response: Some(jsonrpc_result(
                                id,
                                serde_json::to_value(response)
                                    .expect("serializable MCP tool response"),
                            )),
                            session_id: session_id_for_response.clone(),
                        }),
                    },
                    None => {
                        let workspaces = list_open_workspaces_locked(&inner);
                        let response = text_tool_response(
                            format!(
                                "No OpenSCAD Studio workspace is selected for this MCP session.\n\nCall `select_workspace` with a `workspace_root` or `window_id` first.\n\n{}",
                                format_workspace_list(&workspaces)
                            ),
                            true,
                        );
                        return Ok(RpcOutcome {
                            response: Some(jsonrpc_result(
                                id,
                                serde_json::to_value(response)
                                    .expect("serializable MCP tool response"),
                            )),
                            session_id: session_id_for_response.clone(),
                        });
                    }
                }
            };

            call_frontend_tool(
                app,
                inner,
                maybe_window_id.as_deref().expect("window id present"),
                name,
                arguments,
            )
            .unwrap_or_else(|message| text_tool_response(message, true))
        }
        _ => {
            let window_id = {
                let Some(session_id) = session_id.as_deref() else {
                    return Ok(RpcOutcome {
                        response: Some(jsonrpc_result(
                            id,
                            serde_json::to_value(text_tool_response(
                                "No OpenSCAD Studio workspace is selected for this MCP session. Call `select_workspace` first.",
                                true,
                            ))
                            .expect("serializable MCP tool response"),
                        )),
                        session_id: session_id_for_response.clone(),
                    });
                };

                let mut inner = inner.lock().unwrap();
                match require_bound_window_id(&mut inner, session_id) {
                    Ok(window_id) => window_id,
                    Err(response) => {
                        return Ok(RpcOutcome {
                            response: Some(jsonrpc_result(
                                id,
                                serde_json::to_value(response)
                                    .expect("serializable MCP tool response"),
                            )),
                            session_id: session_id_for_response.clone(),
                        })
                    }
                }
            };

            call_frontend_tool(app, inner, &window_id, name, arguments)
                .unwrap_or_else(|message| text_tool_response(message, true))
        }
    };

    Ok(RpcOutcome {
        response: Some(jsonrpc_result(
            id,
            serde_json::to_value(result).expect("serializable MCP tool response"),
        )),
        session_id: session_id_for_response,
    })
}

fn handle_rpc_message(
    app: &AppHandle,
    inner: &Arc<Mutex<McpStateInner>>,
    payload: Value,
    session_id: Option<String>,
) -> Result<RpcOutcome, Value> {
    let id = payload.get("id").cloned().unwrap_or(Value::Null);
    let Some(method) = payload.get("method").and_then(Value::as_str) else {
        return Err(jsonrpc_error(id, -32600, "Missing JSON-RPC method."));
    };

    let params = payload.get("params").cloned().unwrap_or_else(|| json!({}));

    match method {
        "initialize" => {
            let session_id = {
                let mut inner = inner.lock().unwrap();
                ensure_session_id(&mut inner, session_id)
            };

            Ok(RpcOutcome {
                response: Some(jsonrpc_result(
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
                )),
                session_id: Some(session_id),
            })
        }
        "notifications/initialized" => Ok(RpcOutcome {
            response: None,
            session_id,
        }),
        "ping" => Ok(RpcOutcome {
            response: Some(jsonrpc_result(id, json!({}))),
            session_id,
        }),
        "tools/list" => Ok(RpcOutcome {
            response: Some(jsonrpc_result(
                id,
                json!({
                    "tools": tool_definitions()
                }),
            )),
            session_id,
        }),
        "tools/call" => handle_tool_call(app, inner, session_id, params, id),
        _ => Err(jsonrpc_error(
            id,
            -32601,
            format!("Method not found: {method}"),
        )),
    }
}

fn find_request_header(request: &Request, name: &'static str) -> Option<String> {
    request
        .headers()
        .iter()
        .find(|header| header.field.equiv(name))
        .map(|header| header.value.as_str().to_string())
}

fn respond_to_request(mut request: Request, app: &AppHandle, inner: &Arc<Mutex<McpStateInner>>) {
    if request.url() != "/mcp" {
        let _ = request.respond(empty_response(404));
        return;
    }

    if request.method() == &Method::Delete {
        if let Some(session_id) = find_request_header(&request, MCP_SESSION_HEADER) {
            inner.lock().unwrap().sessions.remove(&session_id);
        }
        let _ = request.respond(empty_response(204));
        return;
    }

    if request.method() != &Method::Post {
        let _ = request.respond(empty_response(405));
        return;
    }

    let mut body = String::new();
    if request.as_reader().read_to_string(&mut body).is_err() {
        let _ = request.respond(json_response(
            400,
            &jsonrpc_error(Value::Null, -32700, "Failed to read request body."),
            None,
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
                None,
            ));
            return;
        }
    };

    if payload.is_array() {
        let _ = request.respond(json_response(
            400,
            &jsonrpc_error(Value::Null, -32600, "Batch requests are not supported."),
            None,
        ));
        return;
    }

    let session_id = find_request_header(&request, MCP_SESSION_HEADER);
    match handle_rpc_message(app, inner, payload, session_id) {
        Ok(outcome) => match outcome.response {
            Some(response) => {
                let _ =
                    request.respond(json_response(200, &response, outcome.session_id.as_deref()));
            }
            None => {
                let _ = request.respond(empty_response(202));
            }
        },
        Err(error) => {
            let _ = request.respond(json_response(400, &error, None));
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
                let port = inner.lock().unwrap().status.port;
                inner.lock().unwrap().status = build_status(
                    true,
                    port,
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
        inner.sessions.clear();
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

#[tauri::command]
pub fn mcp_update_window_context(
    window: Window,
    payload: WindowContextPayload,
    state: State<'_, McpServerState>,
) -> Result<(), String> {
    let label = window.label().to_string();
    let normalized_root = payload
        .workspace_root
        .as_deref()
        .and_then(normalize_workspace_root);
    let title = payload.title.unwrap_or_else(|| "OpenSCAD Studio".into());
    let is_focused = window.is_focused().unwrap_or(false);

    let mut inner = state.inner.lock().unwrap();
    let next_focus_order = if is_focused {
        inner.next_focus_order += 1;
        inner.next_focus_order
    } else {
        inner
            .workspaces
            .get(&label)
            .map(|workspace| workspace.last_focused_order)
            .unwrap_or(0)
    };

    inner.workspaces.insert(
        label.clone(),
        RegisteredWorkspace {
            descriptor: WorkspaceDescriptor {
                window_id: label,
                title,
                workspace_root: normalized_root,
                render_target_path: payload.render_target_path,
                is_focused,
            },
            ready: payload.ready,
            last_focused_order: next_focus_order,
        },
    );

    Ok(())
}

pub fn update_window_focus(state: &McpServerState, window_id: &str, is_focused: bool) {
    let mut inner = state.inner.lock().unwrap();
    if is_focused {
        inner.next_focus_order += 1;
    }
    let next_focus_order = inner.next_focus_order;
    if let Some(workspace) = inner.workspaces.get_mut(window_id) {
        workspace.descriptor.is_focused = is_focused;
        if is_focused {
            workspace.last_focused_order = next_focus_order;
        }
    }
}

pub fn remove_window(state: &McpServerState, window_id: &str) {
    let mut inner = state.inner.lock().unwrap();
    remove_window_and_invalidate_sessions_locked(&mut inner, window_id);
}

#[cfg(test)]
mod tests {
    use super::*;

    fn workspace(window_id: &str, root: Option<&str>, title: &str) -> RegisteredWorkspace {
        RegisteredWorkspace {
            descriptor: WorkspaceDescriptor {
                window_id: window_id.into(),
                title: title.into(),
                workspace_root: root.map(|value| value.into()),
                render_target_path: Some("main.scad".into()),
                is_focused: false,
            },
            ready: true,
            last_focused_order: 0,
        }
    }

    #[test]
    fn ensure_session_id_preserves_existing_id() {
        let mut inner = McpStateInner {
            running_server: None,
            pending: HashMap::new(),
            status: build_status(false, MCP_DEFAULT_PORT, McpServerStateKind::Disabled, None),
            workspaces: HashMap::new(),
            sessions: HashMap::new(),
            next_focus_order: 0,
        };

        let session_id = ensure_session_id(&mut inner, Some("session-1".into()));

        assert_eq!(session_id, "session-1");
        assert!(inner.sessions.contains_key("session-1"));
    }

    #[test]
    fn select_workspace_binds_by_window_id() {
        let mut inner = McpStateInner {
            running_server: None,
            pending: HashMap::new(),
            status: build_status(false, MCP_DEFAULT_PORT, McpServerStateKind::Disabled, None),
            workspaces: HashMap::from([(
                "window-a".into(),
                workspace("window-a", Some("/tmp/project-a"), "Project A"),
            )]),
            sessions: HashMap::from([("session-1".into(), McpSessionBinding::default())]),
            next_focus_order: 0,
        };

        let response =
            select_workspace_response(&mut inner, "session-1", &json!({ "window_id": "window-a" }));

        assert!(!response.is_error);
        assert_eq!(
            inner
                .sessions
                .get("session-1")
                .and_then(|session| session.bound_window_id.clone()),
            Some("window-a".into())
        );
    }

    #[test]
    fn require_bound_window_id_errors_when_unbound() {
        let mut inner = McpStateInner {
            running_server: None,
            pending: HashMap::new(),
            status: build_status(false, MCP_DEFAULT_PORT, McpServerStateKind::Disabled, None),
            workspaces: HashMap::new(),
            sessions: HashMap::from([("session-1".into(), McpSessionBinding::default())]),
            next_focus_order: 0,
        };

        let response = require_bound_window_id(&mut inner, "session-1").unwrap_err();
        assert!(response.is_error);
        assert!(matches!(
            response.content.first(),
            Some(McpContentItem::Text { text }) if text.contains("No OpenSCAD Studio workspace is selected")
        ));
    }

    #[test]
    fn remove_window_invalidates_bound_sessions() {
        let mut inner = McpStateInner {
            running_server: None,
            pending: HashMap::new(),
            status: build_status(false, MCP_DEFAULT_PORT, McpServerStateKind::Disabled, None),
            workspaces: HashMap::from([(
                "window-a".into(),
                workspace("window-a", Some("/tmp/project-a"), "Project A"),
            )]),
            sessions: HashMap::from([(
                "session-1".into(),
                McpSessionBinding {
                    bound_window_id: Some("window-a".into()),
                },
            )]),
            next_focus_order: 0,
        };

        remove_window_and_invalidate_sessions_locked(&mut inner, "window-a");

        assert!(!inner.workspaces.contains_key("window-a"));
        assert_eq!(
            inner
                .sessions
                .get("session-1")
                .and_then(|session| session.bound_window_id.clone()),
            None
        );
    }
}
