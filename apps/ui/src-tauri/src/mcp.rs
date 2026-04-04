use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::fs;
use std::sync::{mpsc, Arc, Mutex};
use std::thread::{self, JoinHandle};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager, State, Window};
use tiny_http::{Header, Method, Request, Response, Server, StatusCode};
use uuid::Uuid;

use crate::create_new_window_with_launch_intent;

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

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum RegisteredWindowMode {
    Welcome,
    Opening,
    Ready,
    OpenFailed,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum WindowLaunchIntent {
    Welcome,
    OpenFolder {
        request_id: String,
        folder_path: String,
        create_if_empty: bool,
    },
    OpenFile {
        request_id: String,
        file_path: String,
    },
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum WindowOpenRequest {
    OpenFolder {
        folder_path: String,
        create_if_empty: bool,
    },
    OpenFile {
        file_path: String,
    },
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct WindowOpenRequestPayload {
    request_id: String,
    request: WindowOpenRequest,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WindowContextPayload {
    pub title: Option<String>,
    pub workspace_root: Option<String>,
    pub render_target_path: Option<String>,
    pub mode: Option<RegisteredWindowMode>,
    pub pending_request_id: Option<String>,
    #[serde(default)]
    pub show_welcome: bool,
    #[serde(default = "default_true")]
    pub ready: bool,
}

#[derive(Clone, Debug)]
struct RegisteredWorkspace {
    descriptor: WorkspaceDescriptor,
    show_welcome: bool,
    mode: RegisteredWindowMode,
    pending_request_id: Option<String>,
    context_ready: bool,
    bridge_ready: bool,
    last_focused_order: u64,
}

#[derive(Clone, Debug)]
struct WindowOpenResult {
    message: String,
    opened_workspace_root: Option<String>,
}

struct PendingWindowOpenRequest {
    window_id: String,
    sender: mpsc::Sender<Result<WindowOpenResult, String>>,
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
    window_open_requests: HashMap<String, PendingWindowOpenRequest>,
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
                window_open_requests: HashMap::new(),
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

fn ordered_registered_workspaces(inner: &McpStateInner) -> Vec<(&String, &RegisteredWorkspace)> {
    let mut workspaces: Vec<_> = inner.workspaces.iter().collect();
    workspaces.sort_by(|a, b| {
        b.1.descriptor
            .is_focused
            .cmp(&a.1.descriptor.is_focused)
            .then_with(|| b.1.last_focused_order.cmp(&a.1.last_focused_order))
            .then_with(|| a.1.descriptor.title.cmp(&b.1.descriptor.title))
            .then_with(|| a.0.cmp(b.0))
    });
    workspaces
}

fn choose_existing_workspace_for_root(
    inner: &McpStateInner,
    normalized_root: &str,
) -> Option<String> {
    ordered_registered_workspaces(inner)
        .into_iter()
        .find(|(_, workspace)| {
            workspace.context_ready
                && workspace.mode == RegisteredWindowMode::Ready
                && workspace.descriptor.workspace_root.as_deref() == Some(normalized_root)
        })
        .map(|(window_id, _)| window_id.clone())
}

fn choose_blank_welcome_window(inner: &McpStateInner) -> Option<String> {
    ordered_registered_workspaces(inner)
        .into_iter()
        .find(|(_, workspace)| {
            workspace.context_ready
                && workspace.bridge_ready
                && workspace.show_welcome
                && workspace.mode == RegisteredWindowMode::Welcome
                && workspace.pending_request_id.is_none()
                && workspace.descriptor.workspace_root.is_none()
        })
        .map(|(window_id, _)| window_id.clone())
}

fn bind_session_to_window(inner: &mut McpStateInner, session_id: &str, window_id: String) {
    inner
        .sessions
        .entry(session_id.to_string())
        .or_default()
        .bound_window_id = Some(window_id);
}

fn wait_for_window_tool_ready(
    inner: &Arc<Mutex<McpStateInner>>,
    window_id: &str,
    timeout: Duration,
) -> Result<(), String> {
    let deadline = Instant::now() + timeout;

    loop {
        if inner
            .lock()
            .unwrap()
            .workspaces
            .get(window_id)
            .map(|workspace| workspace.context_ready && workspace.bridge_ready)
            .unwrap_or(false)
        {
            return Ok(());
        }

        if Instant::now() >= deadline {
            return Err(format!(
                "Timed out waiting for OpenSCAD Studio window `{window_id}` to finish starting its MCP bridge."
            ));
        }

        thread::sleep(Duration::from_millis(50));
    }
}

fn ensure_session_id(inner: &mut McpStateInner, existing_session_id: Option<String>) -> String {
    let session_id = existing_session_id.unwrap_or_else(|| Uuid::new_v4().to_string());
    inner.sessions.entry(session_id.clone()).or_default();
    session_id
}

fn remove_window_and_invalidate_sessions_locked(inner: &mut McpStateInner, window_id: &str) {
    inner.workspaces.remove(window_id);
    let pending_request_ids = inner
        .window_open_requests
        .iter()
        .filter_map(|(request_id, pending)| {
            (pending.window_id == window_id).then_some(request_id.clone())
        })
        .collect::<Vec<_>>();
    for request_id in pending_request_ids {
        if let Some(pending) = inner.window_open_requests.remove(&request_id) {
            let _ = pending.sender.send(Err(format!(
                "OpenSCAD Studio window `{window_id}` closed before it finished opening the requested target."
            )));
        }
    }
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
            "This MCP session is not initialized. Reconnect your client and call `get_or_create_workspace(folder_path)` before using Studio tools.",
            true,
        ));
    };

    let Some(window_id) = session.bound_window_id.clone() else {
        return Err(text_tool_response(
            "No OpenSCAD Studio workspace is selected for this MCP session. Call `get_or_create_workspace(folder_path)` first.",
            true,
        ));
    };

    match inner.workspaces.get(&window_id) {
        Some(workspace) if workspace.context_ready => Ok(window_id),
        Some(_) => Err(text_tool_response(
            format!(
                "The selected Studio window `{window_id}` is not ready for MCP requests yet. Wait a moment and try again."
            ),
            true,
        )),
        None => {
            session.bound_window_id = None;
            Err(text_tool_response(
                format!(
                    "The previously selected Studio window `{window_id}` is no longer available. Call `get_or_create_workspace(folder_path)` again."
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
    wait_for_window_tool_ready(inner, window_id, Duration::from_secs(5))?;

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

fn create_window_open_request(
    inner: &Arc<Mutex<McpStateInner>>,
    window_id: &str,
) -> (String, mpsc::Receiver<Result<WindowOpenResult, String>>) {
    let request_id = Uuid::new_v4().to_string();
    let (tx, rx) = mpsc::channel();
    inner.lock().unwrap().window_open_requests.insert(
        request_id.clone(),
        PendingWindowOpenRequest {
            window_id: window_id.to_string(),
            sender: tx,
        },
    );
    (request_id, rx)
}

fn wait_for_window_open_result(
    inner: &Arc<Mutex<McpStateInner>>,
    request_id: &str,
    rx: mpsc::Receiver<Result<WindowOpenResult, String>>,
    window_id: &str,
    target_description: &str,
    timeout: Duration,
) -> Result<WindowOpenResult, String> {
    match rx.recv_timeout(timeout) {
        Ok(result) => result,
        Err(mpsc::RecvTimeoutError::Timeout) => {
            inner
                .lock()
                .unwrap()
                .window_open_requests
                .remove(request_id);
            Err(format!(
                "Timed out waiting for OpenSCAD Studio to open `{target_description}` in window `{window_id}`."
            ))
        }
        Err(mpsc::RecvTimeoutError::Disconnected) => {
            inner
                .lock()
                .unwrap()
                .window_open_requests
                .remove(request_id);
            Err(format!(
                "OpenSCAD Studio lost the result channel while opening `{target_description}` in window `{window_id}`."
            ))
        }
    }
}

fn dispatch_window_open_request(
    app: &AppHandle,
    inner: &Arc<Mutex<McpStateInner>>,
    window_id: &str,
    request: WindowOpenRequest,
) -> Result<WindowOpenResult, String> {
    wait_for_window_tool_ready(inner, window_id, Duration::from_secs(5))?;

    let target_description = match &request {
        WindowOpenRequest::OpenFolder { folder_path, .. } => folder_path.clone(),
        WindowOpenRequest::OpenFile { file_path } => file_path.clone(),
    };
    let (request_id, rx) = create_window_open_request(inner, window_id);
    eprintln!(
        "[mcp] dispatch_window_open_request window={} request_id={} target={}",
        window_id, request_id, target_description
    );

    let payload = WindowOpenRequestPayload {
        request_id: request_id.clone(),
        request,
    };

    {
        let mut locked = inner.lock().unwrap();
        if let Some(workspace) = locked.workspaces.get_mut(window_id) {
            workspace.mode = RegisteredWindowMode::Opening;
            workspace.pending_request_id = Some(request_id.clone());
            workspace.show_welcome = false;
        }
    }

    let Some(window) = app.get_webview_window(window_id) else {
        inner
            .lock()
            .unwrap()
            .window_open_requests
            .remove(&request_id);
        return Err(format!(
            "OpenSCAD Studio window `{window_id}` is no longer available."
        ));
    };

    if let Err(error) = window.emit("desktop:open-request", payload) {
        let mut locked = inner.lock().unwrap();
        locked.window_open_requests.remove(&request_id);
        if let Some(workspace) = locked.workspaces.get_mut(window_id) {
            workspace.mode = RegisteredWindowMode::Welcome;
            workspace.pending_request_id = None;
            workspace.show_welcome = true;
        }
        return Err(format!(
            "Failed to dispatch desktop open request to OpenSCAD Studio window `{window_id}`: {error}"
        ));
    }

    wait_for_window_open_result(
        inner,
        &request_id,
        rx,
        window_id,
        &target_description,
        Duration::from_secs(120),
    )
}

fn tool_definitions() -> Value {
    json!([
        {
            "name": "get_or_create_workspace",
            "description": "Ensure this MCP session is bound to the exact requested workspace folder by attaching to an already-open match or opening/initializing it in OpenSCAD Studio.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "folder_path": {
                        "type": "string",
                        "description": "Absolute folder path to open as the Studio workspace."
                    }
                },
                "required": ["folder_path"],
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

fn get_or_create_workspace_response(
    app: &AppHandle,
    inner: &Arc<Mutex<McpStateInner>>,
    session_id: &str,
    arguments: &Value,
) -> McpToolResponse {
    let folder_path = arguments
        .get("folder_path")
        .or_else(|| arguments.get("workspace_root"))
        .or_else(|| arguments.get("path"))
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty());

    let Some(folder_path) = folder_path else {
        return text_tool_response(
            "get_or_create_workspace requires a `folder_path` argument.",
            true,
        );
    };

    let Some(normalized_root) = normalize_workspace_root(folder_path) else {
        return text_tool_response(
            format!("Could not resolve workspace folder `{folder_path}`."),
            true,
        );
    };

    let existing_window_id = {
        let mut locked = inner.lock().unwrap();
        locked.sessions.entry(session_id.to_string()).or_default();
        choose_existing_workspace_for_root(&locked, &normalized_root)
    };

    if let Some(window_id) = existing_window_id {
        eprintln!(
            "[mcp] get_or_create_workspace matched existing window={} root={}",
            window_id, normalized_root
        );
        let response = {
            let mut locked = inner.lock().unwrap();
            bind_session_to_window(&mut locked, session_id, window_id.clone());
            let workspace = locked
                .workspaces
                .get(&window_id)
                .map(|entry| entry.descriptor.clone());
            if let Some(workspace) = workspace {
                let render_target = workspace
                    .render_target_path
                    .unwrap_or_else(|| "(no render target)".into());
                text_tool_response(
                    format!(
                        "✅ Attached this MCP session to the already-open OpenSCAD Studio workspace at {}.\n\nWindow: {}\nRender target: {}",
                        normalized_root, workspace.window_id, render_target
                    ),
                    false,
                )
            } else {
                text_tool_response(
                    format!(
                        "OpenSCAD Studio window `{window_id}` was no longer available while attaching the workspace."
                    ),
                    true,
                )
            }
        };

        return response;
    }

    let target_window_id = {
        let locked = inner.lock().unwrap();
        choose_blank_welcome_window(&locked)
    };

    let (target_window_id, detail) = if let Some(window_id) = target_window_id {
        eprintln!(
            "[mcp] get_or_create_workspace reusing blank welcome window={} root={}",
            window_id, normalized_root
        );
        match dispatch_window_open_request(
            app,
            inner,
            &window_id,
            WindowOpenRequest::OpenFolder {
                folder_path: normalized_root.clone(),
                create_if_empty: true,
            },
        ) {
            Ok(result) => {
                let opened_root = result
                    .opened_workspace_root
                    .as_deref()
                    .and_then(normalize_workspace_root);
                if opened_root.as_deref() != Some(normalized_root.as_str()) {
                    return text_tool_response(
                        format!(
                            "OpenSCAD Studio opened the wrong workspace in window `{window_id}`. Expected `{normalized_root}`, got `{}`.",
                            opened_root.unwrap_or_else(|| "(unknown workspace)".into())
                        ),
                        true,
                    );
                }
                (window_id, result.message)
            }
            Err(message) => return text_tool_response(message, true),
        }
    } else {
        let (request_id, rx) = create_window_open_request(inner, "pending-new-window");
        eprintln!(
            "[mcp] get_or_create_workspace creating new window for root={} request_id={}",
            normalized_root, request_id
        );
        match create_new_window_with_launch_intent(
            app,
            WindowLaunchIntent::OpenFolder {
                request_id: request_id.clone(),
                folder_path: normalized_root.clone(),
                create_if_empty: true,
            },
        ) {
            Ok(window_id) => {
                eprintln!(
                    "[mcp] get_or_create_workspace created new window={} request_id={}",
                    window_id, request_id
                );
                {
                    let mut locked = inner.lock().unwrap();
                    if let Some(pending) = locked.window_open_requests.get_mut(&request_id) {
                        pending.window_id = window_id.clone();
                    }
                }
                let result = match wait_for_window_open_result(
                    inner,
                    &request_id,
                    rx,
                    &window_id,
                    &normalized_root,
                    Duration::from_secs(120),
                ) {
                    Ok(result) => result,
                    Err(message) => return text_tool_response(message, true),
                };
                let opened_root = result
                    .opened_workspace_root
                    .as_deref()
                    .and_then(normalize_workspace_root);
                if opened_root.as_deref() != Some(normalized_root.as_str()) {
                    return text_tool_response(
                        format!(
                            "OpenSCAD Studio opened the wrong workspace in window `{window_id}`. Expected `{normalized_root}`, got `{}`.",
                            opened_root.unwrap_or_else(|| "(unknown workspace)".into())
                        ),
                        true,
                    );
                }
                let detail = {
                    let locked = inner.lock().unwrap();
                    if let Some(workspace) = locked.workspaces.get(&window_id) {
                        let render_target = workspace
                            .descriptor
                            .render_target_path
                            .clone()
                            .unwrap_or_else(|| "(no render target)".into());
                        format!(
                            "✅ Opened workspace at {}.\n\nRender target: {}",
                            normalized_root, render_target
                        )
                    } else {
                        result.message
                    }
                };
                (window_id, detail)
            }
            Err(error) => {
                inner
                    .lock()
                    .unwrap()
                    .window_open_requests
                    .remove(&request_id);
                return text_tool_response(
                    format!("Failed to create a new OpenSCAD Studio window: {error}"),
                    true,
                );
            }
        }
    };

    let mut locked = inner.lock().unwrap();
    bind_session_to_window(&mut locked, session_id, target_window_id.clone());

    text_tool_response(
        format!(
            "{detail}\n\n✅ Bound this MCP session to OpenSCAD Studio window `{target_window_id}`."
        ),
        false,
    )
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
        "get_or_create_workspace" => match session_id.as_deref() {
            Some(session_id) => get_or_create_workspace_response(app, inner, session_id, &arguments),
            None => text_tool_response(
                "This MCP request does not have a session id yet. Reconnect your MCP client and retry workspace creation.",
                true,
            ),
        },
        "get_project_context" => {
            let window_id = {
                let Some(session_id) = session_id.as_deref() else {
                    return Ok(RpcOutcome {
                        response: Some(jsonrpc_result(
                            id,
                            serde_json::to_value(text_tool_response(
                                "No OpenSCAD Studio workspace is selected for this MCP session. Call `get_or_create_workspace(folder_path)` first.",
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

            call_frontend_tool(
                app,
                inner,
                &window_id,
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
                                "No OpenSCAD Studio workspace is selected for this MCP session. Call `get_or_create_workspace(folder_path)` first.",
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
        inner.window_open_requests.clear();
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
    let render_target_path = payload.render_target_path.clone();
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
    let previous_bridge_ready = inner
        .workspaces
        .get(&label)
        .map(|workspace| workspace.bridge_ready)
        .unwrap_or(false);

    inner.workspaces.insert(
        label.clone(),
        RegisteredWorkspace {
            descriptor: WorkspaceDescriptor {
                window_id: label.clone(),
                title,
                workspace_root: normalized_root,
                render_target_path,
                is_focused,
            },
            show_welcome: payload.show_welcome,
            mode: payload.mode.unwrap_or(if payload.show_welcome {
                RegisteredWindowMode::Welcome
            } else {
                RegisteredWindowMode::Ready
            }),
            pending_request_id: payload.pending_request_id,
            context_ready: payload.ready,
            bridge_ready: previous_bridge_ready,
            last_focused_order: next_focus_order,
        },
    );

    Ok(())
}

#[tauri::command]
pub fn mcp_mark_window_bridge_ready(
    window: Window,
    state: State<'_, McpServerState>,
) -> Result<(), String> {
    let label = window.label().to_string();
    let is_focused = window.is_focused().unwrap_or(false);

    let mut inner = state.inner.lock().unwrap();
    let workspace = inner
        .workspaces
        .entry(label.clone())
        .or_insert_with(|| RegisteredWorkspace {
            descriptor: WorkspaceDescriptor {
                window_id: label.clone(),
                title: "OpenSCAD Studio".into(),
                workspace_root: None,
                render_target_path: None,
                is_focused,
            },
            show_welcome: true,
            mode: RegisteredWindowMode::Welcome,
            pending_request_id: None,
            context_ready: false,
            bridge_ready: false,
            last_focused_order: 0,
        });
    workspace.bridge_ready = true;

    Ok(())
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WindowOpenResultPayload {
    pub request_id: String,
    pub success: bool,
    pub message: Option<String>,
    pub opened_workspace_root: Option<String>,
}

#[tauri::command]
pub fn report_window_open_result(
    window: Window,
    payload: WindowOpenResultPayload,
    state: State<'_, McpServerState>,
) -> Result<(), String> {
    let label = window.label().to_string();
    let mut inner = state.inner.lock().unwrap();

    inner
        .workspaces
        .entry(label.clone())
        .or_insert_with(|| RegisteredWorkspace {
            descriptor: WorkspaceDescriptor {
                window_id: label.clone(),
                title: "OpenSCAD Studio".into(),
                workspace_root: None,
                render_target_path: None,
                is_focused: window.is_focused().unwrap_or(false),
            },
            show_welcome: true,
            mode: RegisteredWindowMode::Welcome,
            pending_request_id: None,
            context_ready: false,
            bridge_ready: false,
            last_focused_order: 0,
        });

    if let Some(pending) = inner.window_open_requests.remove(&payload.request_id) {
        if let Some(workspace) = inner.workspaces.get_mut(&label) {
            workspace.pending_request_id = None;
            workspace.mode = if payload.success {
                if payload.opened_workspace_root.is_some() {
                    workspace.show_welcome = false;
                    RegisteredWindowMode::Ready
                } else if workspace.show_welcome {
                    RegisteredWindowMode::Welcome
                } else {
                    RegisteredWindowMode::Ready
                }
            } else {
                RegisteredWindowMode::OpenFailed
            };
        }
        eprintln!(
            "[mcp] report_window_open_result window={} request_id={} success={} workspace_root={}",
            label,
            payload.request_id,
            payload.success,
            payload.opened_workspace_root.as_deref().unwrap_or("(none)")
        );
        let result = if payload.success {
            Ok(WindowOpenResult {
                message: payload
                    .message
                    .unwrap_or_else(|| "Opened target successfully.".into()),
                opened_workspace_root: payload
                    .opened_workspace_root
                    .as_deref()
                    .and_then(normalize_workspace_root),
            })
        } else {
            Err(payload
                .message
                .unwrap_or_else(|| "Failed to open the requested target.".into()))
        };
        let _ = pending.sender.send(result);
    }

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

    fn workspace(
        window_id: &str,
        root: Option<&str>,
        title: &str,
        show_welcome: bool,
    ) -> RegisteredWorkspace {
        RegisteredWorkspace {
            descriptor: WorkspaceDescriptor {
                window_id: window_id.into(),
                title: title.into(),
                workspace_root: root.map(|value| value.into()),
                render_target_path: Some("main.scad".into()),
                is_focused: false,
            },
            show_welcome,
            mode: if show_welcome {
                RegisteredWindowMode::Welcome
            } else {
                RegisteredWindowMode::Ready
            },
            pending_request_id: None,
            context_ready: true,
            bridge_ready: true,
            last_focused_order: 0,
        }
    }

    #[test]
    fn ensure_session_id_preserves_existing_id() {
        let mut inner = McpStateInner {
            running_server: None,
            pending: HashMap::new(),
            window_open_requests: HashMap::new(),
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
    fn require_bound_window_id_errors_when_unbound() {
        let mut inner = McpStateInner {
            running_server: None,
            pending: HashMap::new(),
            window_open_requests: HashMap::new(),
            status: build_status(false, MCP_DEFAULT_PORT, McpServerStateKind::Disabled, None),
            workspaces: HashMap::new(),
            sessions: HashMap::from([("session-1".into(), McpSessionBinding::default())]),
            next_focus_order: 0,
        };

        let response = require_bound_window_id(&mut inner, "session-1").unwrap_err();
        assert!(response.is_error);
        assert!(matches!(
            response.content.first(),
            Some(McpContentItem::Text { text }) if text.contains("get_or_create_workspace")
        ));
    }

    #[test]
    fn remove_window_invalidates_bound_sessions() {
        let mut inner = McpStateInner {
            running_server: None,
            pending: HashMap::new(),
            window_open_requests: HashMap::new(),
            status: build_status(false, MCP_DEFAULT_PORT, McpServerStateKind::Disabled, None),
            workspaces: HashMap::from([(
                "window-a".into(),
                workspace("window-a", Some("/tmp/project-a"), "Project A", false),
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

    #[test]
    fn choose_existing_workspace_for_root_prefers_matching_workspace() {
        let inner = McpStateInner {
            running_server: None,
            pending: HashMap::new(),
            window_open_requests: HashMap::new(),
            status: build_status(false, MCP_DEFAULT_PORT, McpServerStateKind::Disabled, None),
            workspaces: HashMap::from([
                (
                    "window-a".into(),
                    workspace("window-a", Some("/tmp/project-a"), "Project A", false),
                ),
                (
                    "window-b".into(),
                    workspace("window-b", None, "Welcome", true),
                ),
            ]),
            sessions: HashMap::new(),
            next_focus_order: 0,
        };

        assert_eq!(
            choose_existing_workspace_for_root(&inner, "/tmp/project-a"),
            Some("window-a".into())
        );
    }

    #[test]
    fn choose_blank_welcome_window_ignores_non_welcome_windows_without_roots() {
        let inner = McpStateInner {
            running_server: None,
            pending: HashMap::new(),
            window_open_requests: HashMap::new(),
            status: build_status(false, MCP_DEFAULT_PORT, McpServerStateKind::Disabled, None),
            workspaces: HashMap::from([
                (
                    "window-a".into(),
                    workspace("window-a", None, "Unsaved Scratch", false),
                ),
                (
                    "window-b".into(),
                    workspace("window-b", None, "Welcome", true),
                ),
            ]),
            sessions: HashMap::new(),
            next_focus_order: 0,
        };

        assert_eq!(choose_blank_welcome_window(&inner), Some("window-b".into()));
    }

    #[test]
    fn wait_for_window_tool_ready_requires_bridge_listener() {
        let inner = Arc::new(Mutex::new(McpStateInner {
            running_server: None,
            pending: HashMap::new(),
            window_open_requests: HashMap::new(),
            status: build_status(false, MCP_DEFAULT_PORT, McpServerStateKind::Disabled, None),
            workspaces: HashMap::from([(
                "main".into(),
                RegisteredWorkspace {
                    descriptor: WorkspaceDescriptor {
                        window_id: "main".into(),
                        title: "Project".into(),
                        workspace_root: Some("/tmp/project".into()),
                        render_target_path: Some("main.scad".into()),
                        is_focused: true,
                    },
                    show_welcome: false,
                    mode: RegisteredWindowMode::Ready,
                    pending_request_id: None,
                    context_ready: true,
                    bridge_ready: false,
                    last_focused_order: 1,
                },
            )]),
            sessions: HashMap::new(),
            next_focus_order: 0,
        }));

        let result = wait_for_window_tool_ready(&inner, "main", Duration::from_millis(0));

        assert!(result.is_err());
        assert!(result
            .unwrap_err()
            .contains("finish starting its MCP bridge"));
    }

    #[test]
    fn wait_for_window_tool_ready_succeeds_when_context_and_bridge_are_ready() {
        let inner = Arc::new(Mutex::new(McpStateInner {
            running_server: None,
            pending: HashMap::new(),
            window_open_requests: HashMap::new(),
            status: build_status(false, MCP_DEFAULT_PORT, McpServerStateKind::Disabled, None),
            workspaces: HashMap::from([(
                "main".into(),
                RegisteredWorkspace {
                    descriptor: WorkspaceDescriptor {
                        window_id: "main".into(),
                        title: "Project".into(),
                        workspace_root: Some("/tmp/project".into()),
                        render_target_path: Some("main.scad".into()),
                        is_focused: true,
                    },
                    show_welcome: false,
                    mode: RegisteredWindowMode::Ready,
                    pending_request_id: None,
                    context_ready: true,
                    bridge_ready: true,
                    last_focused_order: 1,
                },
            )]),
            sessions: HashMap::new(),
            next_focus_order: 0,
        }));

        let result = wait_for_window_tool_ready(&inner, "main", Duration::from_millis(0));

        assert!(result.is_ok());
    }
}
