use crate::cmd::{
    apply_edit, get_current_code, get_diagnostics, get_preview_screenshot, trigger_render,
    validate_edit, EditorState,
};
use serde::{Deserialize, Serialize};
use std::process::Stdio;
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, Command};
use tokio::sync::Mutex;

#[derive(Debug, Serialize, Deserialize)]
struct JsonRpcRequest {
    jsonrpc: String,
    id: u64,
    method: String,
    params: serde_json::Value,
}

#[derive(Debug, Serialize, Deserialize)]
struct JsonRpcResponse {
    jsonrpc: String,
    id: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    result: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<JsonRpcError>,
}

#[derive(Debug, Serialize, Deserialize)]
struct JsonRpcError {
    code: i32,
    message: String,
}

pub struct AgentSidecar {
    child: Arc<Mutex<Option<Child>>>,
    stdin: Arc<Mutex<Option<tokio::process::ChildStdin>>>,
}

impl AgentSidecar {
    /// Find node executable in common locations
    fn find_node() -> Result<String, String> {
        // Try `which node` first (works in dev mode)
        if let Ok(output) = std::process::Command::new("which").arg("node").output() {
            if output.status.success() {
                let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
                if !path.is_empty() && std::path::Path::new(&path).exists() {
                    return Ok(path);
                }
            }
        }

        // Check common node installation paths
        let common_paths = vec![
            "/usr/local/bin/node",
            "/opt/homebrew/bin/node",
            "/usr/bin/node",
        ];

        for path in common_paths {
            if std::path::Path::new(path).exists() {
                return Ok(path.to_string());
            }
        }

        // Check nvm default path
        if let Ok(home) = std::env::var("HOME") {
            let nvm_default = format!("{}/.nvm/versions/node", home);
            if let Ok(entries) = std::fs::read_dir(&nvm_default) {
                // Find the first node version
                for entry in entries.flatten() {
                    let node_path = entry.path().join("bin/node");
                    if node_path.exists() {
                        return Ok(node_path.to_string_lossy().to_string());
                    }
                }
            }
        }

        Err("Node.js not found. Please install Node.js from https://nodejs.org/ or ensure it's in your PATH.".to_string())
    }

    pub async fn spawn(app_handle: &AppHandle, api_key: String, provider: String) -> Result<Self, String> {
        // Get path to sidecar executable
        // In dev mode, use source path. In production, use bundled resources.
        let sidecar_path = if cfg!(debug_assertions) {
            // Development mode: look in source tree
            // Go up from target/debug/... to project root
            let current_exe = std::env::current_exe()
                .map_err(|e| format!("Failed to get current exe: {}", e))?;

            // Navigate to project root (from target/debug/openscad-copilot -> ../../..)
            let project_root = current_exe
                .parent() // target/debug
                .and_then(|p| p.parent()) // target
                .and_then(|p| p.parent()) // src-tauri
                .and_then(|p| p.parent()) // ui
                .and_then(|p| p.parent()) // apps
                .and_then(|p| p.parent()) // project root
                .ok_or_else(|| "Failed to determine project root".to_string())?;

            project_root
                .join("apps")
                .join("sidecar")
                .join("dist")
                .join("agent-server.js")
        } else {
            // Production mode: use bundled resources
            let resource_dir = app_handle
                .path()
                .resource_dir()
                .map_err(|e| format!("Failed to get resource directory: {}", e))?;

            resource_dir
                .join("sidecar")
                .join("dist")
                .join("agent-server.js")
        };

        println!("[Sidecar] Looking for agent server at: {:?}", sidecar_path);

        if !sidecar_path.exists() {
            return Err(format!(
                "Sidecar not found at {:?}. Make sure to run 'pnpm build:sidecar' first.",
                sidecar_path
            ));
        }

        // Find node executable
        let node_path = Self::find_node()?;
        println!("[Sidecar] Using node at: {:?}", node_path);

        // Spawn node process with API key and provider in environment
        println!("[Sidecar] Spawning Node process with provider: {}...", provider);

        let api_key_env = match provider.as_str() {
            "openai" => "OPENAI_API_KEY",
            _ => "ANTHROPIC_API_KEY",
        };

        let mut child = Command::new(&node_path)
            .arg(&sidecar_path)
            .env(api_key_env, api_key)
            .env("AI_PROVIDER", &provider)
            .env("NODE_ENV", "production")
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| format!("Failed to spawn sidecar process: {}", e))?;

        // Capture stderr for logging
        if let Some(stderr) = child.stderr.take() {
            tokio::spawn(async move {
                let reader = BufReader::new(stderr);
                let mut lines = reader.lines();
                while let Ok(Some(line)) = lines.next_line().await {
                    eprintln!("[Sidecar stderr] {}", line);
                }
            });
        }

        // Handle stdout (JSON-RPC requests from sidecar)
        let app = app_handle.clone();
        let stdin_for_queries = child.stdin.take();
        let stdin_arc = Arc::new(Mutex::new(stdin_for_queries));

        if let Some(stdout) = child.stdout.take() {
            let stdin_clone = stdin_arc.clone();
            tokio::spawn(async move {
                Self::handle_stdout(stdout, stdin_clone, app).await;
            });
        }

        println!("[Sidecar] Process spawned successfully");

        Ok(Self {
            child: Arc::new(Mutex::new(Some(child))),
            stdin: stdin_arc,
        })
    }

    /// Handle stdout from sidecar (JSON-RPC requests and streaming events)
    async fn handle_stdout(
        stdout: tokio::process::ChildStdout,
        stdin: Arc<Mutex<Option<tokio::process::ChildStdin>>>,
        app: AppHandle,
    ) {
        let reader = BufReader::new(stdout);
        let mut lines = reader.lines();

        while let Ok(Some(line)) = lines.next_line().await {
            let line = line.trim();
            if line.is_empty() {
                continue;
            }

            println!("[Sidecar] Received message: {}", line);

            // Try to parse as generic JSON first
            let json: serde_json::Value = match serde_json::from_str(&line) {
                Ok(j) => j,
                Err(e) => {
                    eprintln!("[Sidecar] Failed to parse JSON: {}", e);
                    continue;
                }
            };

            // Check if it's a streaming event (has 'type' field but not 'jsonrpc')
            if let Some(event_type) = json.get("type").and_then(|v| v.as_str()) {
                println!("[Sidecar] Emitting ai-stream event: {}", event_type);
                let _ = app.emit("ai-stream", json);
                continue;
            }

            // Otherwise, parse as JSON-RPC request
            let request: JsonRpcRequest = match serde_json::from_value(json) {
                Ok(req) => req,
                Err(e) => {
                    eprintln!("[Sidecar] Failed to parse as JSON-RPC request: {}", e);
                    continue;
                }
            };

            // Handle request and send response
            let response = Self::handle_request(request, &app).await;
            let response_json = serde_json::to_string(&response).unwrap();

            println!("[Sidecar] Sending JSON-RPC response: {}", response_json);

            // Write response to sidecar stdin
            if let Some(ref mut stdin_guard) = *stdin.lock().await {
                let _ = stdin_guard.write_all(response_json.as_bytes()).await;
                let _ = stdin_guard.write_all(b"\n").await;
                let _ = stdin_guard.flush().await;
            }
        }

        println!("[Sidecar] stdout closed");
    }

    /// Route JSON-RPC request to appropriate handler
    async fn handle_request(request: JsonRpcRequest, app: &AppHandle) -> JsonRpcResponse {
        let result = match request.method.as_str() {
            "get_current_code" => {
                let state: State<EditorState> = app.state();
                match get_current_code(state) {
                    Ok(code) => Ok(serde_json::to_value(code).unwrap()),
                    Err(e) => Err(JsonRpcError {
                        code: -32603,
                        message: e,
                    }),
                }
            }
            "get_preview_screenshot" => {
                let state: State<EditorState> = app.state();
                match get_preview_screenshot(state) {
                    Ok(path) => Ok(serde_json::to_value(path).unwrap()),
                    Err(e) => Err(JsonRpcError {
                        code: -32603,
                        message: e,
                    }),
                }
            }
            "validate_edit" => {
                let old_string: String = match serde_json::from_value(
                    request.params.get("old_string").cloned().unwrap_or_default(),
                ) {
                    Ok(s) => s,
                    Err(e) => {
                        return JsonRpcResponse {
                            jsonrpc: "2.0".to_string(),
                            id: request.id,
                            result: None,
                            error: Some(JsonRpcError {
                                code: -32602,
                                message: format!("Invalid params: {}", e),
                            }),
                        };
                    }
                };

                let new_string: String = match serde_json::from_value(
                    request.params.get("new_string").cloned().unwrap_or_default(),
                ) {
                    Ok(s) => s,
                    Err(e) => {
                        return JsonRpcResponse {
                            jsonrpc: "2.0".to_string(),
                            id: request.id,
                            result: None,
                            error: Some(JsonRpcError {
                                code: -32602,
                                message: format!("Invalid params: {}", e),
                            }),
                        };
                    }
                };

                let state: State<EditorState> = app.state();
                match validate_edit(old_string, new_string, state) {
                    Ok(validation) => Ok(serde_json::to_value(validation).unwrap()),
                    Err(e) => Err(JsonRpcError {
                        code: -32603,
                        message: e,
                    }),
                }
            }
            "apply_edit" => {
                let old_string: String = match serde_json::from_value(
                    request.params.get("old_string").cloned().unwrap_or_default(),
                ) {
                    Ok(s) => s,
                    Err(e) => {
                        return JsonRpcResponse {
                            jsonrpc: "2.0".to_string(),
                            id: request.id,
                            result: None,
                            error: Some(JsonRpcError {
                                code: -32602,
                                message: format!("Invalid params: {}", e),
                            }),
                        };
                    }
                };

                let new_string: String = match serde_json::from_value(
                    request.params.get("new_string").cloned().unwrap_or_default(),
                ) {
                    Ok(s) => s,
                    Err(e) => {
                        return JsonRpcResponse {
                            jsonrpc: "2.0".to_string(),
                            id: request.id,
                            result: None,
                            error: Some(JsonRpcError {
                                code: -32602,
                                message: format!("Invalid params: {}", e),
                            }),
                        };
                    }
                };

                let state: State<EditorState> = app.state();
                let openscad_path = state.openscad_path.lock().unwrap().clone();

                match apply_edit(app.clone(), old_string, new_string, state, openscad_path).await {
                    Ok(result) => Ok(serde_json::to_value(result).unwrap()),
                    Err(e) => Err(JsonRpcError {
                        code: -32603,
                        message: e,
                    }),
                }
            }
            "get_diagnostics" => {
                let state: State<EditorState> = app.state();
                match get_diagnostics(state) {
                    Ok(diagnostics) => Ok(serde_json::to_value(diagnostics).unwrap()),
                    Err(e) => Err(JsonRpcError {
                        code: -32603,
                        message: e,
                    }),
                }
            }
            "trigger_render" => match trigger_render(app.clone()).await {
                Ok(_) => Ok(serde_json::Value::Null),
                Err(e) => Err(JsonRpcError {
                    code: -32603,
                    message: e,
                }),
            },
            _ => Err(JsonRpcError {
                code: -32601,
                message: format!("Method not found: {}", request.method),
            }),
        };

        match result {
            Ok(value) => JsonRpcResponse {
                jsonrpc: "2.0".to_string(),
                id: request.id,
                result: Some(value),
                error: None,
            },
            Err(error) => JsonRpcResponse {
                jsonrpc: "2.0".to_string(),
                id: request.id,
                result: None,
                error: Some(error),
            },
        }
    }

    pub async fn shutdown(&self) -> Result<(), String> {
        println!("[Sidecar] Shutting down...");
        if let Some(mut child) = self.child.lock().await.take() {
            child
                .kill()
                .await
                .map_err(|e| format!("Failed to kill sidecar process: {}", e))?;
        }
        println!("[Sidecar] Shutdown complete");
        Ok(())
    }
}

impl Drop for AgentSidecar {
    fn drop(&mut self) {
        println!("[Sidecar] AgentSidecar dropped, cleaning up...");
        if let Ok(mut guard) = self.child.try_lock() {
            if let Some(mut child) = guard.take() {
                let _ = child.start_kill();
            }
        }
    }
}

// Global state for managing the sidecar
pub struct AgentSidecarState {
    pub sidecar: Arc<Mutex<Option<AgentSidecar>>>,
}

impl AgentSidecarState {
    pub fn new() -> Self {
        Self {
            sidecar: Arc::new(Mutex::new(None)),
        }
    }
}

/// Start the Agent SDK sidecar process
#[tauri::command]
pub async fn start_agent_sidecar(
    app: AppHandle,
    api_key: String,
    provider: String,
    state: State<'_, AgentSidecarState>,
) -> Result<(), String> {
    println!("[start_agent_sidecar] Command called with provider: {}", provider);
    let mut sidecar_guard = state.sidecar.lock().await;

    // Don't start if already running
    if sidecar_guard.is_some() {
        println!("[start_agent_sidecar] Sidecar already running");
        return Ok(());
    }

    println!("[start_agent_sidecar] Spawning new sidecar...");
    let sidecar = AgentSidecar::spawn(&app, api_key, provider).await?;
    *sidecar_guard = Some(sidecar);
    println!("[start_agent_sidecar] Sidecar spawned successfully");

    Ok(())
}

/// Stop the Agent SDK sidecar process
#[tauri::command]
pub async fn stop_agent_sidecar(state: State<'_, AgentSidecarState>) -> Result<(), String> {
    let mut sidecar_guard = state.sidecar.lock().await;

    if let Some(sidecar) = sidecar_guard.take() {
        sidecar.shutdown().await?;
    }

    Ok(())
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Message {
    role: String,
    content: String,
    timestamp: u64,
}

/// Send a query to the AI agent
#[tauri::command]
pub async fn send_agent_query(
    messages: Vec<Message>,
    mode: String,
    state: State<'_, AgentSidecarState>,
) -> Result<(), String> {
    println!("[send_agent_query] Command called with mode: {}, messages: {}", mode, messages.len());
    let sidecar_guard = state.sidecar.lock().await;

    let sidecar = match sidecar_guard.as_ref() {
        Some(s) => s,
        None => {
            println!("[send_agent_query] ERROR: Sidecar not running");
            return Err("Sidecar not running. Call start_agent_sidecar first.".to_string());
        }
    };

    // Send query to sidecar via stdin as newline-delimited JSON
    let query = serde_json::json!({
        "type": "query",
        "messages": messages,
        "mode": mode,
    });

    let query_json = serde_json::to_string(&query)
        .map_err(|e| format!("Failed to serialize query: {}", e))?;

    println!("[send_agent_query] Sending to sidecar: {}", query_json);

    let mut stdin_guard = sidecar.stdin.lock().await;
    if let Some(stdin) = stdin_guard.as_mut() {
        stdin.write_all(query_json.as_bytes()).await
            .map_err(|e| format!("Failed to write to sidecar stdin: {}", e))?;
        stdin.write_all(b"\n").await
            .map_err(|e| format!("Failed to write newline to sidecar stdin: {}", e))?;
        stdin.flush().await
            .map_err(|e| format!("Failed to flush sidecar stdin: {}", e))?;
        println!("[send_agent_query] Query sent successfully to sidecar");
    } else {
        println!("[send_agent_query] ERROR: Sidecar stdin not available");
        return Err("Sidecar stdin not available".to_string());
    }

    Ok(())
}

/// Cancel ongoing AI stream
#[tauri::command]
pub async fn cancel_agent_stream(state: State<'_, AgentSidecarState>) -> Result<(), String> {
    let sidecar_guard = state.sidecar.lock().await;

    if sidecar_guard.is_none() {
        return Ok(()); // Nothing to cancel
    }

    // TODO: Send cancellation signal to sidecar
    println!("[Sidecar] Canceling stream");

    Ok(())
}
