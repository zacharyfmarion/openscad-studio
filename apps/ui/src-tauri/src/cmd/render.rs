use serde::Serialize;
use std::collections::HashMap;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Manager, State};

// ============================================================================
// Types
// ============================================================================

#[derive(Debug, Serialize)]
pub struct RenderNativeResult {
    pub output: Vec<u8>,
    pub stderr: String,
    pub exit_code: i32,
    pub duration_ms: u64,
}

/// Managed state holding the resolved path to the OpenSCAD binary.
pub struct OpenScadBinaryState {
    pub path: Mutex<Option<PathBuf>>,
    pub version: Mutex<Option<String>>,
}

impl Default for OpenScadBinaryState {
    fn default() -> Self {
        Self {
            path: Mutex::new(None),
            version: Mutex::new(None),
        }
    }
}

// ============================================================================
// Binary discovery
// ============================================================================

/// Resolve the path to the OpenSCAD binary.
/// Tries (in order):
/// 1. Bundled sidecar binary (apps/ui/src-tauri/binaries/openscad)
/// 2. System-installed binary via PATH
fn resolve_binary_path(app: &AppHandle) -> Option<PathBuf> {
    // Try bundled sidecar first
    if let Ok(resource_dir) = app.path().resource_dir() {
        let sidecar = resource_dir.join("binaries").join("openscad");
        if sidecar.exists() {
            eprintln!("[render] Found bundled OpenSCAD at {:?}", sidecar);
            return Some(sidecar);
        }
    }

    // Try system PATH
    if let Ok(output) = Command::new("which").arg("openscad").output() {
        if output.status.success() {
            let path_str = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if !path_str.is_empty() {
                let path = PathBuf::from(&path_str);
                if path.exists() {
                    eprintln!("[render] Found system OpenSCAD at {:?}", path);
                    return Some(path);
                }
            }
        }
    }

    None
}

/// Get the OpenSCAD version string from the binary.
fn get_binary_version(binary_path: &Path) -> Option<String> {
    let output = Command::new(binary_path)
        .arg("--version")
        .output()
        .ok()?;

    // OpenSCAD prints version to stderr
    let stderr = String::from_utf8_lossy(&output.stderr);
    let stdout = String::from_utf8_lossy(&output.stdout);
    let version_str = if stderr.contains("OpenSCAD") {
        stderr.trim().to_string()
    } else if stdout.contains("OpenSCAD") {
        stdout.trim().to_string()
    } else {
        return None;
    };

    Some(version_str)
}

// ============================================================================
// Temp directory helpers
// ============================================================================

/// Create a temp directory for a render, write input files, return the paths.
struct RenderWorkspace {
    dir: PathBuf,
    input_path: PathBuf,
    output_path: PathBuf,
}

fn create_render_workspace(
    code: &str,
    output_filename: &str,
    auxiliary_files: &Option<HashMap<String, String>>,
    input_path: &Option<String>,
) -> Result<RenderWorkspace, String> {
    let render_id = uuid::Uuid::new_v4().to_string();
    let base_dir = std::env::temp_dir()
        .join("openscad-studio")
        .join(&render_id);

    // Create the input_dir subdirectory (mirrors WASM's /input_dir/)
    let input_dir = base_dir.join("input_dir");
    fs::create_dir_all(&input_dir).map_err(|e| format!("Failed to create temp dir: {}", e))?;

    // Determine input file path
    let relative_input = input_path
        .as_deref()
        .unwrap_or("input.scad");
    let input_file_path = input_dir.join(relative_input);

    // Create parent directories for nested input paths
    if let Some(parent) = input_file_path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create input parent dirs: {}", e))?;
    }

    // Write the main input file
    let mut file = fs::File::create(&input_file_path)
        .map_err(|e| format!("Failed to create input file: {}", e))?;
    file.write_all(code.as_bytes())
        .map_err(|e| format!("Failed to write input file: {}", e))?;

    // Write auxiliary files (library files, project .scad files)
    if let Some(aux_files) = auxiliary_files {
        for (rel_path, content) in aux_files {
            let aux_path = input_dir.join(rel_path);
            if let Some(parent) = aux_path.parent() {
                fs::create_dir_all(parent)
                    .map_err(|e| format!("Failed to create aux dir for {}: {}", rel_path, e))?;
            }
            let mut aux_file = fs::File::create(&aux_path)
                .map_err(|e| format!("Failed to create aux file {}: {}", rel_path, e))?;
            aux_file
                .write_all(content.as_bytes())
                .map_err(|e| format!("Failed to write aux file {}: {}", rel_path, e))?;
        }
    }

    let output_file_path = base_dir.join(output_filename);

    Ok(RenderWorkspace {
        dir: base_dir,
        input_path: input_file_path,
        output_path: output_file_path,
    })
}

// ============================================================================
// Tauri commands
// ============================================================================

const RENDER_TIMEOUT_SECS: u64 = 120;
const MAX_STDERR_BYTES: usize = 100 * 1024; // 100KB

/// Initialize the native render backend: find the binary and cache its path.
#[tauri::command]
pub async fn render_init(
    app: AppHandle,
    state: State<'_, OpenScadBinaryState>,
) -> Result<String, String> {
    let binary_path =
        resolve_binary_path(&app).ok_or("OpenSCAD binary not found. Install OpenSCAD or place the binary in the app's binaries/ directory.")?;

    let version = get_binary_version(&binary_path).unwrap_or_else(|| "unknown".to_string());
    eprintln!(
        "[render] OpenSCAD initialized: {:?} ({})",
        binary_path,
        version
    );

    *state.path.lock().unwrap() = Some(binary_path);
    *state.version.lock().unwrap() = Some(version.clone());

    Ok(version)
}

/// Render OpenSCAD code using the native binary.
#[tauri::command]
pub async fn render_native(
    code: String,
    args: Vec<String>,
    auxiliary_files: Option<HashMap<String, String>>,
    input_path: Option<String>,
    working_dir: Option<String>,
    state: State<'_, OpenScadBinaryState>,
) -> Result<RenderNativeResult, String> {
    let binary_path = state
        .path
        .lock()
        .unwrap()
        .clone()
        .ok_or("OpenSCAD binary not initialized. Call render_init first.")?;

    // Determine output filename from args (find -o flag)
    let output_filename = args
        .windows(2)
        .find(|w| w[0] == "-o")
        .map(|w| w[1].trim_start_matches('/').to_string())
        .unwrap_or_else(|| "output.off".to_string());

    // Create workspace with input files
    let workspace =
        create_render_workspace(&code, &output_filename, &auxiliary_files, &input_path)?;

    // Build the command
    let mut cmd = Command::new(&binary_path);

    // Replace the original input path in args with our temp file path
    // and the output path with our temp output path
    for arg in &args {
        if arg == "/input.scad" || arg.starts_with("/input_dir/") {
            cmd.arg(workspace.input_path.to_str().unwrap());
        } else if arg.starts_with("/output.") {
            cmd.arg(workspace.output_path.to_str().unwrap());
        } else if arg == "-o" {
            cmd.arg("-o");
        } else {
            cmd.arg(arg);
        }
    }

    // Add working directory as a search path so import() can find assets
    if let Some(ref wd) = working_dir {
        // OpenSCAD uses the file's directory as default search path,
        // but we also add the project root explicitly
        cmd.arg("-p").arg(wd);
    }

    eprintln!(
        "[render] Executing: {:?} (working_dir: {:?})",
        cmd,
        working_dir
    );

    let start = Instant::now();

    // Spawn process with timeout
    let child = cmd
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to spawn OpenSCAD: {} (binary: {:?})", e, binary_path))?;

    // Wait with timeout
    let output = tokio_timeout_wait(child, Duration::from_secs(RENDER_TIMEOUT_SECS))
        .map_err(|e| e.to_string())?;

    let duration_ms = start.elapsed().as_millis() as u64;

    // Collect stderr (truncate if too large)
    let stderr_raw = String::from_utf8_lossy(&output.stderr);
    let stderr = if stderr_raw.len() > MAX_STDERR_BYTES {
        let truncated = &stderr_raw.as_bytes()[..MAX_STDERR_BYTES];
        let mut s = String::from_utf8_lossy(truncated).to_string();
        s.push_str("\n... (stderr truncated)");
        s
    } else {
        stderr_raw.to_string()
    };

    let exit_code = output.status.code().unwrap_or(-1);

    eprintln!(
        "[render] Completed in {}ms, exit_code={}, stderr_len={}",
        duration_ms,
        exit_code,
        stderr.len()
    );

    // Read output file if it exists
    let output_bytes = if workspace.output_path.exists() {
        fs::read(&workspace.output_path)
            .map_err(|e| format!("Failed to read output file: {}", e))?
    } else {
        Vec::new()
    };

    // Clean up temp directory (best-effort)
    if let Err(e) = fs::remove_dir_all(&workspace.dir) {
        eprintln!("[render] Failed to clean up temp dir {:?}: {}", workspace.dir, e);
    }

    Ok(RenderNativeResult {
        output: output_bytes,
        stderr,
        exit_code,
        duration_ms,
    })
}

/// Cancel a running render by killing the process.
/// For now this is a no-op — process cancellation will be added when we
/// track child PIDs in state. The frontend can still call renderService.cancel()
/// which prevents it from processing the result.
#[tauri::command]
pub async fn render_cancel() -> Result<(), String> {
    // TODO: Track child PID in state and kill here
    Ok(())
}

// ============================================================================
// Timeout helper (without tokio — uses std threads)
// ============================================================================

fn tokio_timeout_wait(
    child: std::process::Child,
    timeout: Duration,
) -> Result<std::process::Output, String> {
    // Use a thread to wait, with a timeout via channel
    let (tx, rx) = std::sync::mpsc::channel();

    let handle = std::thread::spawn(move || {
        let result = child.wait_with_output();
        let _ = tx.send(result);
    });

    match rx.recv_timeout(timeout) {
        Ok(result) => {
            let _ = handle.join();
            result.map_err(|e| format!("OpenSCAD process error: {}", e))
        }
        Err(std::sync::mpsc::RecvTimeoutError::Timeout) => {
            // Process timed out — we can't easily kill it from here since
            // ownership moved to the thread, but we return an error
            Err(format!(
                "OpenSCAD render timed out after {}s",
                timeout.as_secs()
            ))
        }
        Err(e) => Err(format!("Channel error waiting for OpenSCAD: {}", e)),
    }
}
