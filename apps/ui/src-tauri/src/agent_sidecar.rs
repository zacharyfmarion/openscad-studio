use crate::cmd::{
    apply_diff, get_current_code, get_diagnostics, get_preview_screenshot, trigger_render,
    validate_diff, EditorState,
};
use serde::{Deserialize, Serialize};
use std::process::Stdio;
use std::sync::Arc;
use tauri::{AppHandle, Manager, State};
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
}

impl AgentSidecar {
    pub async fn spawn(app_handle: &AppHandle, api_key: String) -> Result<Self, String> {
        // Get path to bundled sidecar executable
        let resource_dir = app_handle
            .path()
            .resource_dir()
            .map_err(|e| format!("Failed to get resource directory: {}", e))?;

        let sidecar_path = resource_dir
            .join("sidecar")
            .join("dist")
            .join("agent-server.js");

        println!("[Sidecar] Looking for agent server at: {:?}", sidecar_path);

        if !sidecar_path.exists() {
            return Err(format!(
                "Sidecar not found at {:?}. Make sure to run 'pnpm build:sidecar' first.",
                sidecar_path
            ));
        }

        // Spawn node process with API key in environment
        println!("[Sidecar] Spawning Node process...");
        let mut child = Command::new("node")
            .arg(&sidecar_path)
            .env("ANTHROPIC_API_KEY", api_key)
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
        if let Some(stdout) = child.stdout.take() {
            let stdin_handle = child.stdin.take();
            tokio::spawn(async move {
                Self::handle_stdout(stdout, stdin_handle, app).await;
            });
        }

        println!("[Sidecar] Process spawned successfully");

        Ok(Self {
            child: Arc::new(Mutex::new(Some(child))),
        })
    }

    /// Handle stdout from sidecar (JSON-RPC requests)
    async fn handle_stdout(
        stdout: tokio::process::ChildStdout,
        stdin: Option<tokio::process::ChildStdin>,
        app: AppHandle,
    ) {
        let reader = BufReader::new(stdout);
        let mut lines = reader.lines();
        let stdin = Arc::new(Mutex::new(stdin));

        while let Ok(Some(line)) = lines.next_line().await {
            let line = line.trim();
            if line.is_empty() {
                continue;
            }

            println!("[Sidecar] Received request: {}", line);

            // Parse JSON-RPC request
            let request: JsonRpcRequest = match serde_json::from_str(&line) {
                Ok(req) => req,
                Err(e) => {
                    eprintln!("[Sidecar] Failed to parse request: {}", e);
                    continue;
                }
            };

            // Handle request and send response
            let response = Self::handle_request(request, &app).await;
            let response_json = serde_json::to_string(&response).unwrap();

            println!("[Sidecar] Sending response: {}", response_json);

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
            "validate_diff" => {
                let diff: String = match serde_json::from_value(
                    request.params.get("diff").cloned().unwrap_or_default(),
                ) {
                    Ok(d) => d,
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
                match validate_diff(diff, state) {
                    Ok(validation) => Ok(serde_json::to_value(validation).unwrap()),
                    Err(e) => Err(JsonRpcError {
                        code: -32603,
                        message: e,
                    }),
                }
            }
            "apply_diff" => {
                let diff: String = match serde_json::from_value(
                    request.params.get("diff").cloned().unwrap_or_default(),
                ) {
                    Ok(d) => d,
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
                // TODO: Get openscad_path from app state or config
                let openscad_path = "openscad".to_string();

                match apply_diff(app.clone(), diff, state, openscad_path).await {
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
