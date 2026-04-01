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
/// 1. Bundled OpenSCAD.app resource (Tauri resource bundling)
/// 2. Dev-mode OpenSCAD.app in src-tauri/binaries/
/// 3. System-installed binary via PATH
fn resolve_binary_path(app: &AppHandle) -> Option<PathBuf> {
    // Production: bundled as a Tauri resource at OpenSCAD.app/Contents/MacOS/OpenSCAD
    if let Ok(resource_dir) = app.path().resource_dir() {
        let bundled = resource_dir
            .join("OpenSCAD.app")
            .join("Contents")
            .join("MacOS")
            .join("OpenSCAD");
        if bundled.exists() {
            eprintln!("[render] Found bundled OpenSCAD at {:?}", bundled);
            return Some(bundled);
        }
    }

    // Dev mode: look in src-tauri/binaries/OpenSCAD.app
    let dev_app = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("binaries")
        .join("OpenSCAD.app")
        .join("Contents")
        .join("MacOS")
        .join("OpenSCAD");
    if dev_app.exists() {
        eprintln!("[render] Found dev OpenSCAD at {:?}", dev_app);
        return Some(dev_app);
    }

    // Fallback: system-installed OpenSCAD via PATH
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
    let output = Command::new(binary_path).arg("--version").output().ok()?;

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
// Workspace helpers
// ============================================================================

struct RenderWorkspace {
    /// Temp directory to clean up after render
    temp_dir: PathBuf,
    /// Path to the input .scad file (may be in project dir or temp dir)
    input_path: PathBuf,
    /// Path where OpenSCAD will write the output
    output_path: PathBuf,
    /// Temp files written into the project directory (need cleanup)
    project_temp_files: Vec<PathBuf>,
}

/// Create workspace for a native render.
///
/// When a `working_dir` (project root) is provided, the input file is written
/// as a temp file *inside the project directory* so that all relative paths
/// (`import()`, `include`, `use`) resolve against the real filesystem.
/// Only the output goes to a temp dir.
///
/// When no `working_dir` is provided (e.g., unsaved single-file), everything
/// goes in a temp dir (same as the WASM approach).
fn create_render_workspace(
    code: &str,
    output_filename: &str,
    auxiliary_files: &Option<HashMap<String, String>>,
    input_path: &Option<String>,
    working_dir: &Option<String>,
) -> Result<RenderWorkspace, String> {
    let render_id = uuid::Uuid::new_v4().to_string();
    let temp_dir = std::env::temp_dir()
        .join("openscad-studio")
        .join(&render_id);
    fs::create_dir_all(&temp_dir).map_err(|e| format!("Failed to create temp dir: {}", e))?;

    let output_file_path = temp_dir.join(output_filename);
    let mut project_temp_files = Vec::new();

    let input_file_path = if let Some(wd) = working_dir {
        // Write the input file into the project directory so all relative
        // paths (import, include, use) resolve against the real filesystem.
        let project_root = PathBuf::from(wd);
        let relative_input = input_path.as_deref().unwrap_or("input.scad");

        // Use a temp filename next to the real file to avoid overwriting it
        // (the editor content may have unsaved changes).
        let real_path = project_root.join(relative_input);
        let parent = real_path.parent().unwrap_or(&project_root);
        let stem = real_path
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("input");
        let temp_input = parent.join(format!(
            ".openscad-studio-{}-{}.scad",
            stem,
            &render_id[..8]
        ));

        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create input parent dirs: {}", e))?;
        let mut file = fs::File::create(&temp_input)
            .map_err(|e| format!("Failed to create temp input file: {}", e))?;
        file.write_all(code.as_bytes())
            .map_err(|e| format!("Failed to write temp input file: {}", e))?;

        project_temp_files.push(temp_input.clone());

        // Write any auxiliary files with unsaved changes into the project dir too
        if let Some(aux_files) = auxiliary_files {
            for (rel_path, content) in aux_files {
                // Only write project .scad files (skip library files like BOSL2/)
                if !rel_path.ends_with(".scad") {
                    continue;
                }
                let real_aux = project_root.join(rel_path);
                // Check if the content differs from what's on disk
                let disk_content = fs::read_to_string(&real_aux).unwrap_or_default();
                if disk_content != *content {
                    let aux_parent = real_aux.parent().unwrap_or(&project_root);
                    let aux_stem = real_aux
                        .file_stem()
                        .and_then(|s| s.to_str())
                        .unwrap_or("aux");
                    let temp_aux = aux_parent.join(format!(
                        ".openscad-studio-{}-{}.scad",
                        aux_stem,
                        &render_id[..8]
                    ));
                    if let Some(p) = temp_aux.parent() {
                        fs::create_dir_all(p).ok();
                    }
                    let mut f = fs::File::create(&temp_aux)
                        .map_err(|e| format!("Failed to create temp aux file: {}", e))?;
                    f.write_all(content.as_bytes())
                        .map_err(|e| format!("Failed to write temp aux file: {}", e))?;
                    project_temp_files.push(temp_aux);
                }
            }
        }

        temp_input
    } else {
        // No project root — use temp dir for everything (like WASM)
        let input_dir = temp_dir.join("input_dir");
        fs::create_dir_all(&input_dir).map_err(|e| format!("Failed to create input_dir: {}", e))?;

        let relative_input = input_path.as_deref().unwrap_or("input.scad");
        let input_file = input_dir.join(relative_input);

        if let Some(parent) = input_file.parent() {
            fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create input parent dirs: {}", e))?;
        }
        let mut file = fs::File::create(&input_file)
            .map_err(|e| format!("Failed to create input file: {}", e))?;
        file.write_all(code.as_bytes())
            .map_err(|e| format!("Failed to write input file: {}", e))?;

        // Write auxiliary files to temp dir
        if let Some(aux_files) = auxiliary_files {
            for (rel_path, content) in aux_files {
                let aux_path = input_dir.join(rel_path);
                if let Some(parent) = aux_path.parent() {
                    fs::create_dir_all(parent).ok();
                }
                let mut f = fs::File::create(&aux_path)
                    .map_err(|e| format!("Failed to create aux file {}: {}", rel_path, e))?;
                f.write_all(content.as_bytes())
                    .map_err(|e| format!("Failed to write aux file {}: {}", rel_path, e))?;
            }
        }

        input_file
    };

    Ok(RenderWorkspace {
        temp_dir,
        input_path: input_file_path,
        output_path: output_file_path,
        project_temp_files,
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
        binary_path, version
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

    // Create workspace — when working_dir is set, input files are written
    // into the project directory so all relative paths resolve naturally.
    let workspace = create_render_workspace(
        &code,
        &output_filename,
        &auxiliary_files,
        &input_path,
        &working_dir,
    )?;

    // Build the command
    let mut cmd = Command::new(&binary_path);

    // Replace placeholder paths in args with actual workspace paths
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

    eprintln!(
        "[render] Executing: {:?} (working_dir: {:?})",
        cmd, working_dir
    );

    let start = Instant::now();

    // Spawn process with timeout
    let child = cmd
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| {
            format!(
                "Failed to spawn OpenSCAD: {} (binary: {:?})",
                e, binary_path
            )
        })?;

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

    // Clean up project temp files first (these are in the user's project dir)
    for temp_file in &workspace.project_temp_files {
        if let Err(e) = fs::remove_file(temp_file) {
            eprintln!(
                "[render] Failed to clean up project temp file {:?}: {}",
                temp_file, e
            );
        }
    }

    // Clean up temp output directory
    if let Err(e) = fs::remove_dir_all(&workspace.temp_dir) {
        eprintln!(
            "[render] Failed to clean up temp dir {:?}: {}",
            workspace.temp_dir, e
        );
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
