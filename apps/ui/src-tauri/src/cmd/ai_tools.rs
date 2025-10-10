use crate::types::Diagnostic;
use crate::utils::parser::parse_openscad_stderr;
use diffy::{apply, Patch};
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, State};

// Global state for editor content
pub struct EditorState {
    pub current_code: Mutex<String>,
    pub diagnostics: Mutex<Vec<Diagnostic>>,
    pub last_preview_path: Mutex<String>,
}

impl Default for EditorState {
    fn default() -> Self {
        Self {
            current_code: Mutex::new("// Type your OpenSCAD code here\ncube([10, 10, 10]);".to_string()),
            diagnostics: Mutex::new(Vec::new()),
            last_preview_path: Mutex::new(String::new()),
        }
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DiffValidation {
    pub ok: bool,
    pub error: Option<String>,
    pub lines_changed: usize,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ApplyDiffResult {
    pub success: bool,
    pub error: Option<String>,
    pub diagnostics: Vec<Diagnostic>,
}

/// Get current code from editor
#[tauri::command]
pub fn get_current_code(state: State<'_, EditorState>) -> Result<String, String> {
    let code = state.current_code.lock().unwrap().clone();
    Ok(code)
}

/// Get preview screenshot path
#[tauri::command]
pub fn get_preview_screenshot(state: State<'_, EditorState>) -> Result<String, String> {
    let path = state.last_preview_path.lock().unwrap().clone();
    if path.is_empty() {
        Ok("No preview available yet. Trigger a render first.".to_string())
    } else {
        Ok(path)
    }
}

/// Validate a unified diff
#[tauri::command]
pub fn validate_diff(diff: String, state: State<'_, EditorState>) -> Result<DiffValidation, String> {
    // Parse the diff
    let patch = match Patch::from_str(&diff) {
        Ok(p) => p,
        Err(e) => {
            return Ok(DiffValidation {
                ok: false,
                error: Some(format!("Invalid diff format: {}", e)),
                lines_changed: 0,
            });
        }
    };

    // Count changed lines
    let mut lines_changed = 0;
    for hunk in patch.hunks() {
        for line in hunk.lines() {
            match line {
                diffy::Line::Insert(_) | diffy::Line::Delete(_) => lines_changed += 1,
                _ => {}
            }
        }
    }

    // Check line limit
    if lines_changed > 120 {
        return Ok(DiffValidation {
            ok: false,
            error: Some(format!(
                "Diff too large: {} lines changed (max 120). Please break into smaller changes.",
                lines_changed
            )),
            lines_changed,
        });
    }

    // Try to apply the diff (dry run)
    let current_code = state.current_code.lock().unwrap().clone();
    match apply(&current_code, &patch) {
        Ok(_) => Ok(DiffValidation {
            ok: true,
            error: None,
            lines_changed,
        }),
        Err(e) => Ok(DiffValidation {
            ok: false,
            error: Some(format!("Diff doesn't apply cleanly: {}", e)),
            lines_changed: 0,
        }),
    }
}

/// Apply a diff and test compile
#[tauri::command]
pub async fn apply_diff(
    app: AppHandle,
    diff: String,
    state: State<'_, EditorState>,
    openscad_path: String,
) -> Result<ApplyDiffResult, String> {
    // Parse and apply diff
    let patch = match Patch::from_str(&diff) {
        Ok(p) => p,
        Err(e) => {
            return Ok(ApplyDiffResult {
                success: false,
                error: Some(format!("Invalid diff format: {}", e)),
                diagnostics: vec![],
            });
        }
    };

    let current_code = state.current_code.lock().unwrap().clone();
    let new_code = match apply(&current_code, &patch) {
        Ok(code) => code,
        Err(e) => {
            return Ok(ApplyDiffResult {
                success: false,
                error: Some(format!("Failed to apply diff: {}", e)),
                diagnostics: vec![],
            });
        }
    };

    // Test compile with OpenSCAD
    let old_error_count = state
        .diagnostics
        .lock()
        .unwrap()
        .iter()
        .filter(|d| d.severity == "error")
        .count();

    let test_diagnostics = match test_compile(&new_code, &openscad_path, &app).await {
        Ok(diags) => diags,
        Err(e) => {
            return Ok(ApplyDiffResult {
                success: false,
                error: Some(format!("Test compilation failed: {}", e)),
                diagnostics: vec![],
            });
        }
    };

    let new_error_count = test_diagnostics
        .iter()
        .filter(|d| d.severity == "error")
        .count();

    // Check if new errors were introduced
    if new_error_count > old_error_count {
        return Ok(ApplyDiffResult {
            success: false,
            error: Some("New compilation errors introduced".to_string()),
            diagnostics: test_diagnostics,
        });
    }

    // Apply changes to state
    *state.current_code.lock().unwrap() = new_code.clone();
    *state.diagnostics.lock().unwrap() = test_diagnostics.clone();

    // Emit code update to frontend
    let _ = app.emit("code-updated", new_code);

    Ok(ApplyDiffResult {
        success: true,
        error: None,
        diagnostics: test_diagnostics,
    })
}

/// Get current diagnostics
#[tauri::command]
pub fn get_diagnostics(state: State<'_, EditorState>) -> Result<Vec<Diagnostic>, String> {
    Ok(state.diagnostics.lock().unwrap().clone())
}

/// Trigger a render
#[tauri::command]
pub async fn trigger_render(app: AppHandle) -> Result<(), String> {
    let _ = app.emit("render-requested", ());
    Ok(())
}

/// Helper: Test compile OpenSCAD code
async fn test_compile(
    code: &str,
    openscad_path: &str,
    app: &AppHandle,
) -> Result<Vec<Diagnostic>, String> {
    // Get temp directory
    let app_dir = app
        .path()
        .app_cache_dir()
        .map_err(|e| format!("Failed to get cache dir: {}", e))?;

    std::fs::create_dir_all(&app_dir).map_err(|e| format!("Failed to create cache dir: {}", e))?;

    // Write code to temp file
    let temp_scad = app_dir.join("test_compile.scad");
    std::fs::write(&temp_scad, code).map_err(|e| format!("Failed to write temp file: {}", e))?;

    // Try to compile with OpenSCAD
    let output = tokio::process::Command::new(openscad_path)
        .arg("-o")
        .arg(app_dir.join("test_compile.stl"))
        .arg(&temp_scad)
        .output()
        .await
        .map_err(|e| format!("Failed to run OpenSCAD: {}", e))?;

    // Parse diagnostics from stderr
    let stderr = String::from_utf8_lossy(&output.stderr);
    let diagnostics = parse_openscad_stderr(&stderr);

    // Clean up temp files
    let _ = std::fs::remove_file(&temp_scad);
    let _ = std::fs::remove_file(app_dir.join("test_compile.stl"));

    Ok(diagnostics)
}
