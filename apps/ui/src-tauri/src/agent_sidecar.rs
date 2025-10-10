use serde::{Deserialize, Serialize};
use std::process::Stdio;
use std::sync::Arc;
use tauri::{AppHandle, Manager};
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
    result: Option<serde_json::Value>,
    error: Option<serde_json::Value>,
}

pub struct AgentSidecar {
    child: Arc<Mutex<Child>>,
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

        println!("[Sidecar] Process spawned successfully");

        Ok(Self {
            child: Arc::new(Mutex::new(child)),
        })
    }

    pub async fn send_request(
        &self,
        method: &str,
        params: serde_json::Value,
    ) -> Result<serde_json::Value, String> {
        let request = JsonRpcRequest {
            jsonrpc: "2.0".to_string(),
            id: chrono::Utc::now().timestamp_millis() as u64,
            method: method.to_string(),
            params,
        };

        let request_json = serde_json::to_string(&request)
            .map_err(|e| format!("Failed to serialize request: {}", e))?;

        println!("[Sidecar] Sending request: {}", method);

        let mut child = self.child.lock().await;

        // Write request to stdin
        if let Some(stdin) = child.stdin.as_mut() {
            stdin
                .write_all(request_json.as_bytes())
                .await
                .map_err(|e| format!("Failed to write to sidecar stdin: {}", e))?;
            stdin
                .write_all(b"\n")
                .await
                .map_err(|e| format!("Failed to write newline: {}", e))?;
            stdin
                .flush()
                .await
                .map_err(|e| format!("Failed to flush stdin: {}", e))?;
        } else {
            return Err("Sidecar stdin not available".to_string());
        }

        // Read response from stdout
        if let Some(stdout) = child.stdout.as_mut() {
            let mut reader = BufReader::new(stdout);
            let mut response_line = String::new();

            reader
                .read_line(&mut response_line)
                .await
                .map_err(|e| format!("Failed to read from sidecar stdout: {}", e))?;

            println!("[Sidecar] Received response: {}", response_line.trim());

            let response: JsonRpcResponse = serde_json::from_str(&response_line)
                .map_err(|e| format!("Failed to parse sidecar response: {}", e))?;

            if let Some(error) = response.error {
                return Err(format!("Sidecar returned error: {}", error));
            }

            response
                .result
                .ok_or_else(|| "Sidecar response missing result".to_string())
        } else {
            Err("Sidecar stdout not available".to_string())
        }
    }

    pub async fn shutdown(&self) -> Result<(), String> {
        println!("[Sidecar] Shutting down...");
        let mut child = self.child.lock().await;

        child
            .kill()
            .await
            .map_err(|e| format!("Failed to kill sidecar process: {}", e))?;

        println!("[Sidecar] Shutdown complete");
        Ok(())
    }
}

impl Drop for AgentSidecar {
    fn drop(&mut self) {
        println!("[Sidecar] AgentSidecar dropped, cleaning up...");
        // Note: Tokio runtime might not be available in Drop, so this is best-effort
        if let Ok(mut child) = self.child.try_lock() {
            let _ = child.start_kill();
        }
    }
}

// Add chrono for timestamp generation
// This is a simple workaround - in production you might want a better ID generator
mod chrono {
    pub struct Utc;
    impl Utc {
        pub fn now() -> DateTime {
            DateTime
        }
    }
    pub struct DateTime;
    impl DateTime {
        pub fn timestamp_millis(&self) -> i64 {
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_millis() as i64
        }
    }
}
