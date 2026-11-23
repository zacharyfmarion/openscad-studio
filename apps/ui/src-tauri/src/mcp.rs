use rmcp::{
    handler::server::{router::tool::ToolRouter, wrapper::Parameters},
    model::{CallToolResult, Content, ServerCapabilities, ServerInfo},
    schemars, tool, tool_handler, tool_router,
    transport::streamable_http_server::{
        session::local::LocalSessionManager, StreamableHttpServerConfig, StreamableHttpService,
    },
    ErrorData as McpError, ServerHandler,
};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::fs;
use std::sync::{mpsc, Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager, State, Window};
use uuid::Uuid;

use crate::create_new_window_with_launch_intent;

const MCP_DEFAULT_PORT: u16 = 32123;

// ── Public status types ──────────────────────────────────────────────────────

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

// ── IPC payloads ─────────────────────────────────────────────────────────────

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

// ── Workspace / session types ─────────────────────────────────────────────────

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

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WindowStartupPhasePayload {
    pub phase: String,
    pub detail: Option<String>,
}

#[derive(Clone, Debug)]
struct RegisteredWorkspace {
    descriptor: WorkspaceDescriptor,
    show_welcome: bool,
    mode: RegisteredWindowMode,
    pending_request_id: Option<String>,
    startup_phase: String,
    startup_detail: Option<String>,
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

// ── Running server handle ─────────────────────────────────────────────────────

struct RunningServerHandle {
    cancellation_token: tokio_util::sync::CancellationToken,
    join_handle: tokio::task::JoinHandle<()>,
}

// ── Shared state ──────────────────────────────────────────────────────────────

struct McpStateInner {
    running_server: Option<RunningServerHandle>,
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

// ── Utility functions ─────────────────────────────────────────────────────────

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

fn text_tool_response(message: impl Into<String>, is_error: bool) -> McpToolResponse {
    McpToolResponse {
        content: vec![McpContentItem::Text {
            text: message.into(),
        }],
        is_error,
    }
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

fn describe_workspace_startup_phase(workspace: &RegisteredWorkspace) -> String {
    match &workspace.startup_detail {
        Some(detail) if !detail.trim().is_empty() => {
            format!("last startup phase: {} ({detail})", workspace.startup_phase)
        }
        _ => format!("last startup phase: {}", workspace.startup_phase),
    }
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
            let phase = inner
                .lock()
                .unwrap()
                .workspaces
                .get(window_id)
                .map(describe_workspace_startup_phase)
                .unwrap_or_else(|| "last startup phase: unknown".into());
            return Err(format!(
                "Timed out waiting for OpenSCAD Studio window `{window_id}` to finish starting its MCP bridge ({phase})."
            ));
        }

        std::thread::sleep(Duration::from_millis(50));
    }
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
            let phase = {
                let mut locked = inner.lock().unwrap();
                locked.window_open_requests.remove(request_id);
                locked
                    .workspaces
                    .get(window_id)
                    .map(describe_workspace_startup_phase)
                    .unwrap_or_else(|| "last startup phase: unknown".into())
            };
            Err(format!(
                "Timed out waiting for OpenSCAD Studio to open `{target_description}` in window `{window_id}` ({phase})."
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

/// Opens a file requested by the OS (e.g. Finder double-click) in a blank
/// welcome window when one exists, otherwise in a new window. Blocks until a
/// reused window reports back, so call it off the main thread.
pub(crate) fn open_file_from_os(
    app: &AppHandle,
    state: &McpServerState,
    file_path: &str,
) -> Result<(), String> {
    let inner = &state.inner;
    let welcome_window_id = {
        let locked = inner.lock().unwrap();
        choose_blank_welcome_window(&locked)
    };

    if let Some(window_id) = welcome_window_id {
        if let Some(window) = app.get_webview_window(&window_id) {
            let _ = window.set_focus();
        }
        return dispatch_window_open_request(
            app,
            inner,
            &window_id,
            WindowOpenRequest::OpenFile {
                file_path: file_path.to_string(),
            },
        )
        .map(|_| ());
    }

    create_new_window_with_launch_intent(
        app,
        WindowLaunchIntent::OpenFile {
            request_id: Uuid::new_v4().to_string(),
            file_path: file_path.to_string(),
        },
    )
    .map(|_| ())
    .map_err(|error| format!("Failed to create a new OpenSCAD Studio window: {error}"))
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
        let window_id = match create_new_window_with_launch_intent(
            app,
            WindowLaunchIntent::OpenFolder {
                request_id: request_id.clone(),
                folder_path: normalized_root.clone(),
                create_if_empty: true,
            },
        ) {
            Ok(id) => {
                let mut locked = inner.lock().unwrap();
                if let Some(pending) = locked.window_open_requests.get_mut(&request_id) {
                    pending.window_id = id.clone();
                }
                id
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
        };

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
        (window_id, result.message)
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

fn get_project_context_response(
    inner: &Arc<Mutex<McpStateInner>>,
    session_id: &str,
) -> McpToolResponse {
    let mut locked = inner.lock().unwrap();
    let window_id = match require_bound_window_id(&mut locked, session_id) {
        Ok(window_id) => window_id,
        Err(response) => return response,
    };

    let Some(workspace) = locked.workspaces.get(&window_id) else {
        return text_tool_response(
            format!(
                "The previously selected Studio window `{window_id}` is no longer available. Call `get_or_create_workspace(folder_path)` again."
            ),
            true,
        );
    };

    let mut parts = vec![format!("Studio window: {}", workspace.descriptor.title)];

    if let Some(workspace_root) = &workspace.descriptor.workspace_root {
        parts.push(format!("Workspace root: {workspace_root}"));
    } else {
        parts.push("Workspace root: (none)".into());
    }

    if let Some(render_target_path) = &workspace.descriptor.render_target_path {
        parts.push(format!("Render target: {render_target_path}"));
    } else {
        parts.push("Render target: (none)".into());
    }

    let mode = match workspace.mode {
        RegisteredWindowMode::Welcome => "welcome",
        RegisteredWindowMode::Opening => "opening",
        RegisteredWindowMode::Ready => "ready",
        RegisteredWindowMode::OpenFailed => "open_failed",
    };
    parts.push(format!("Window mode: {mode}"));
    parts.push(describe_workspace_startup_phase(workspace));

    text_tool_response(parts.join("\n"), false)
}

// ── Convert McpToolResponse → rmcp CallToolResult ────────────────────────────

fn mcp_response_to_call_tool_result(response: McpToolResponse) -> CallToolResult {
    let content: Vec<Content> = response
        .content
        .into_iter()
        .map(|item| match item {
            McpContentItem::Text { text } => Content::text(text),
            McpContentItem::Image { data, mime_type } => Content::image(data, mime_type),
        })
        .collect();

    if response.is_error {
        CallToolResult::error(content)
    } else {
        CallToolResult::success(content)
    }
}

// ── Tool parameter structs ────────────────────────────────────────────────────

#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub struct GetOrCreateWorkspaceParams {
    /// Absolute path to the folder to open as a workspace.
    pub folder_path: String,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub struct SetRenderTargetParams {
    /// Workspace-relative path to the .scad file to use as render target.
    pub file_path: String,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub struct GetPreviewScreenshotParams {
    /// View perspective: "front", "back", "left", "right", "top", "bottom", or "isometric"
    pub view: String,
    /// Camera azimuth angle in degrees
    #[serde(default)]
    pub azimuth: Option<f64>,
    /// Camera elevation angle in degrees
    #[serde(default)]
    pub elevation: Option<f64>,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub struct ExportFileParams {
    /// Export format: stl, obj, amf, 3mf, svg, or dxf
    pub format: String,
    /// Absolute output path, or workspace-relative path when a workspace root is open
    pub file_path: String,
}

// ── rmcp handler ──────────────────────────────────────────────────────────────

#[derive(Clone)]
struct OpenScadMcpHandler {
    tool_router: ToolRouter<OpenScadMcpHandler>,
    app: AppHandle,
    shared_state: Arc<Mutex<McpStateInner>>,
    session_id: String,
}

impl Drop for OpenScadMcpHandler {
    fn drop(&mut self) {
        let mut inner = self.shared_state.lock().unwrap();
        inner.sessions.remove(&self.session_id);
    }
}

impl OpenScadMcpHandler {
    fn new(app: AppHandle, shared_state: Arc<Mutex<McpStateInner>>) -> Self {
        let session_id = Uuid::new_v4().to_string();
        {
            let mut inner = shared_state.lock().unwrap();
            inner.sessions.entry(session_id.clone()).or_default();
        }
        Self {
            tool_router: Self::tool_router(),
            app,
            shared_state,
            session_id,
        }
    }

    async fn call_frontend(
        &self,
        tool_name: &str,
        arguments: Value,
    ) -> Result<CallToolResult, McpError> {
        let window_id = {
            let mut locked = self.shared_state.lock().unwrap();
            match require_bound_window_id(&mut locked, &self.session_id) {
                Ok(id) => id,
                Err(resp) => return Ok(mcp_response_to_call_tool_result(resp)),
            }
        };

        let app = self.app.clone();
        let state = self.shared_state.clone();
        let tool = tool_name.to_string();

        let result = tokio::task::spawn_blocking(move || {
            call_frontend_tool(&app, &state, &window_id, &tool, arguments)
        })
        .await
        .map_err(|e| McpError::internal_error(format!("{e}"), None))?;

        Ok(mcp_response_to_call_tool_result(
            result.unwrap_or_else(|e| text_tool_response(e, true)),
        ))
    }
}

#[tool_router]
impl OpenScadMcpHandler {
    #[tool(
        description = "Ensure this MCP session is bound to the exact requested workspace folder by attaching to an already-open match or opening/initializing it in OpenSCAD Studio."
    )]
    async fn get_or_create_workspace(
        &self,
        Parameters(params): Parameters<GetOrCreateWorkspaceParams>,
    ) -> Result<CallToolResult, McpError> {
        let args = serde_json::json!({ "folder_path": params.folder_path });
        let app = self.app.clone();
        let state = self.shared_state.clone();
        let session_id = self.session_id.clone();

        let result = tokio::task::spawn_blocking(move || {
            get_or_create_workspace_response(&app, &state, &session_id, &args)
        })
        .await
        .map_err(|e| McpError::internal_error(format!("{e}"), None))?;

        Ok(mcp_response_to_call_tool_result(result))
    }

    #[tool(
        description = "Get the current OpenSCAD Studio render target and workspace summary for the selected workspace."
    )]
    async fn get_project_context(&self) -> Result<CallToolResult, McpError> {
        let state = self.shared_state.clone();
        let session_id = self.session_id.clone();

        let result =
            tokio::task::spawn_blocking(move || get_project_context_response(&state, &session_id))
                .await
                .map_err(|e| McpError::internal_error(format!("{e}"), None))?;

        Ok(mcp_response_to_call_tool_result(result))
    }

    #[tool(description = "Change which workspace-relative file Studio compiles and previews.")]
    async fn set_render_target(
        &self,
        Parameters(params): Parameters<SetRenderTargetParams>,
    ) -> Result<CallToolResult, McpError> {
        let args = serde_json::json!({ "file_path": params.file_path });
        self.call_frontend("set_render_target", args).await
    }

    #[tool(
        description = "Render the current Studio render target and report the latest diagnostics without failing on compile errors."
    )]
    async fn get_diagnostics(&self) -> Result<CallToolResult, McpError> {
        self.call_frontend("get_diagnostics", serde_json::json!({}))
            .await
    }

    #[tool(
        description = "Render the current Studio render target, refresh the preview, and fail if the render reports errors."
    )]
    async fn trigger_render(&self) -> Result<CallToolResult, McpError> {
        self.call_frontend("trigger_render", serde_json::json!({}))
            .await
    }

    #[tool(
        description = "Capture a PNG screenshot of the latest settled render artifact for the current render target. Requires an explicit 3D view such as front, top, or isometric."
    )]
    async fn get_preview_screenshot(
        &self,
        Parameters(params): Parameters<GetPreviewScreenshotParams>,
    ) -> Result<CallToolResult, McpError> {
        let args = serde_json::json!({
            "view": params.view,
            "azimuth": params.azimuth,
            "elevation": params.elevation,
        });
        self.call_frontend("get_preview_screenshot", args).await
    }

    #[tool(
        description = "Export the current render target to a file path on desktop. If export cannot proceed, the response explains how to verify the render target and diagnostics."
    )]
    async fn export_file(
        &self,
        Parameters(params): Parameters<ExportFileParams>,
    ) -> Result<CallToolResult, McpError> {
        let args = serde_json::json!({
            "format": params.format,
            "file_path": params.file_path,
        });
        self.call_frontend("export_file", args).await
    }
}

#[tool_handler]
impl ServerHandler for OpenScadMcpHandler {
    fn get_info(&self) -> ServerInfo {
        use rmcp::model::Implementation;
        ServerInfo::new(ServerCapabilities::builder().enable_tools().build())
            .with_server_info(Implementation::new(
                "openscad-studio",
                env!("CARGO_PKG_VERSION"),
            ))
            .with_instructions(
                "OpenSCAD Studio MCP server — controls the OpenSCAD Studio desktop editor."
                    .to_string(),
            )
    }
}

// ── Tauri commands ────────────────────────────────────────────────────────────

pub(crate) fn record_window_startup_phase(
    state: &McpServerState,
    window_label: &str,
    phase: impl Into<String>,
    detail: Option<String>,
) {
    let phase = phase.into();
    let mut inner = state.inner.lock().unwrap();
    let workspace = inner
        .workspaces
        .entry(window_label.to_string())
        .or_insert_with(|| RegisteredWorkspace {
            descriptor: WorkspaceDescriptor {
                window_id: window_label.to_string(),
                title: "OpenSCAD Studio".into(),
                workspace_root: None,
                render_target_path: None,
                is_focused: false,
            },
            show_welcome: true,
            mode: RegisteredWindowMode::Welcome,
            pending_request_id: None,
            startup_phase: "created".into(),
            startup_detail: None,
            context_ready: false,
            bridge_ready: false,
            last_focused_order: 0,
        });
    workspace.startup_phase = phase;
    workspace.startup_detail = detail;
}

#[tauri::command]
pub async fn configure_mcp_server(
    app: AppHandle,
    enabled: bool,
    port: u16,
    state: State<'_, McpServerState>,
) -> Result<McpServerStatus, String> {
    // Idempotency check: every window calls this on mount, but we must not
    // restart the server just because a secondary window opened. If the server
    // is already running with the same config, return early.
    {
        let inner = state.inner.lock().unwrap();
        if enabled && inner.running_server.is_some() && inner.status.port == port {
            return Ok(inner.status.clone());
        }
        if !enabled && inner.running_server.is_none() {
            return Ok(inner.status.clone());
        }
    }

    // Take ownership of any existing server handle so we can stop it.
    let previous = {
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

    // Stop the previous server if any.
    if let Some(handle) = previous {
        handle.cancellation_token.cancel();
        let _ = handle.join_handle.await;
    }

    if !enabled {
        let mut inner = state.inner.lock().unwrap();
        inner.status = build_status(false, port, McpServerStateKind::Disabled, None);
        inner.sessions.clear();
        inner.window_open_requests.clear();
        return Ok(inner.status.clone());
    }

    // Try to bind the TCP listener before spawning anything.
    let address = format!("127.0.0.1:{port}");
    let tcp_listener = match tokio::net::TcpListener::bind(&address).await {
        Ok(l) => l,
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

    let shared_state = state.inner.clone();
    let app_handle = app.clone();
    let ct = tokio_util::sync::CancellationToken::new();
    let ct_child = ct.child_token();

    let join_handle = tokio::spawn(async move {
        let service = StreamableHttpService::new(
            move || {
                let handler = OpenScadMcpHandler::new(app_handle.clone(), shared_state.clone());
                Ok(handler)
            },
            std::sync::Arc::new(LocalSessionManager::default()),
            StreamableHttpServerConfig::default().with_cancellation_token(ct_child.clone()),
        );

        let router = axum::Router::new().nest_service("/mcp", service);
        let _ = axum::serve(tcp_listener, router)
            .with_graceful_shutdown(async move {
                ct_child.cancelled().await;
            })
            .await;
    });

    let mut inner = state.inner.lock().unwrap();
    inner.running_server = Some(RunningServerHandle {
        cancellation_token: ct,
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
pub async fn mcp_mark_window_bridge_ready(
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
                window_id: label,
                title: "OpenSCAD Studio".into(),
                workspace_root: None,
                render_target_path: None,
                is_focused,
            },
            show_welcome: true,
            mode: RegisteredWindowMode::Welcome,
            pending_request_id: None,
            startup_phase: "created".into(),
            startup_detail: None,
            context_ready: false,
            bridge_ready: false,
            last_focused_order: 0,
        });
    workspace.bridge_ready = true;
    workspace.startup_phase = "bridge_ready".into();
    workspace.startup_detail = None;
    Ok(())
}

#[tauri::command]
pub async fn mcp_update_window_context(
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
            .map(|w| w.last_focused_order)
            .unwrap_or(0)
    };
    let previous_bridge_ready = inner
        .workspaces
        .get(&label)
        .map(|w| w.bridge_ready)
        .unwrap_or(false);
    let previous_startup_phase = inner
        .workspaces
        .get(&label)
        .map(|w| w.startup_phase.clone())
        .unwrap_or_else(|| "context_updated".into());
    let previous_startup_detail = inner
        .workspaces
        .get(&label)
        .and_then(|w| w.startup_detail.clone());

    inner.workspaces.insert(
        label.clone(),
        RegisteredWorkspace {
            descriptor: WorkspaceDescriptor {
                window_id: label,
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
            startup_phase: previous_startup_phase,
            startup_detail: previous_startup_detail,
            context_ready: payload.ready,
            bridge_ready: previous_bridge_ready,
            last_focused_order: next_focus_order,
        },
    );
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
pub async fn report_window_open_result(
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
                is_focused: false,
            },
            show_welcome: true,
            mode: RegisteredWindowMode::Welcome,
            pending_request_id: None,
            startup_phase: "created".into(),
            startup_detail: None,
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
                .unwrap_or_else(|| "Failed to open target.".into()))
        };
        let _ = pending.sender.send(result);
    }
    Ok(())
}

#[tauri::command]
pub async fn mcp_report_window_startup_phase(
    window: Window,
    payload: WindowStartupPhasePayload,
    state: State<'_, McpServerState>,
) -> Result<(), String> {
    record_window_startup_phase(&state, window.label(), payload.phase, payload.detail);
    Ok(())
}

#[tauri::command]
pub async fn mcp_submit_tool_response(
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

// ── Tests ─────────────────────────────────────────────────────────────────────

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
            startup_phase: if show_welcome {
                "welcome_ready".into()
            } else {
                "ready".into()
            },
            startup_detail: None,
            context_ready: true,
            bridge_ready: true,
            last_focused_order: 0,
        }
    }

    fn make_inner() -> McpStateInner {
        McpStateInner {
            running_server: None,
            pending: HashMap::new(),
            window_open_requests: HashMap::new(),
            status: build_status(false, MCP_DEFAULT_PORT, McpServerStateKind::Disabled, None),
            workspaces: HashMap::new(),
            sessions: HashMap::new(),
            next_focus_order: 0,
        }
    }

    #[test]
    fn require_bound_window_id_errors_when_unbound() {
        let mut inner = make_inner();
        inner
            .sessions
            .insert("session-1".into(), McpSessionBinding::default());

        let response = require_bound_window_id(&mut inner, "session-1").unwrap_err();
        assert!(response.is_error);
        assert!(matches!(
            response.content.first(),
            Some(McpContentItem::Text { text }) if text.contains("get_or_create_workspace")
        ));
    }

    #[test]
    fn remove_window_invalidates_bound_sessions() {
        let mut inner = make_inner();
        inner.workspaces.insert(
            "window-a".into(),
            workspace("window-a", Some("/tmp/project-a"), "Project A", false),
        );
        inner.sessions.insert(
            "session-1".into(),
            McpSessionBinding {
                bound_window_id: Some("window-a".into()),
            },
        );

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
        let mut inner = make_inner();
        inner.workspaces.insert(
            "window-a".into(),
            workspace("window-a", Some("/tmp/project-a"), "Project A", false),
        );
        inner.workspaces.insert(
            "window-b".into(),
            workspace("window-b", None, "Welcome", true),
        );

        assert_eq!(
            choose_existing_workspace_for_root(&inner, "/tmp/project-a"),
            Some("window-a".into())
        );
    }

    #[test]
    fn choose_blank_welcome_window_ignores_non_welcome_windows_without_roots() {
        let mut inner = make_inner();
        inner.workspaces.insert(
            "window-a".into(),
            workspace("window-a", None, "Unsaved Scratch", false),
        );
        inner.workspaces.insert(
            "window-b".into(),
            workspace("window-b", None, "Welcome", true),
        );

        assert_eq!(choose_blank_welcome_window(&inner), Some("window-b".into()));
    }

    #[test]
    fn wait_for_window_tool_ready_requires_bridge_listener() {
        let inner = Arc::new(Mutex::new({
            let mut s = make_inner();
            s.workspaces.insert(
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
                    startup_phase: "ready".into(),
                    startup_detail: None,
                    context_ready: true,
                    bridge_ready: false,
                    last_focused_order: 1,
                },
            );
            s
        }));

        let result = wait_for_window_tool_ready(&inner, "main", Duration::from_millis(0));

        assert!(result.is_err());
        assert!(result
            .unwrap_err()
            .contains("finish starting its MCP bridge"));
    }

    #[test]
    fn wait_for_window_tool_ready_succeeds_when_context_and_bridge_are_ready() {
        let inner = Arc::new(Mutex::new({
            let mut s = make_inner();
            s.workspaces.insert(
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
                    startup_phase: "ready".into(),
                    startup_detail: None,
                    context_ready: true,
                    bridge_ready: true,
                    last_focused_order: 1,
                },
            );
            s
        }));

        let result = wait_for_window_tool_ready(&inner, "main", Duration::from_millis(100));

        assert!(result.is_ok());
    }
}
