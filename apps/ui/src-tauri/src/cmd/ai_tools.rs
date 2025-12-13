use crate::cmd::render::render_with_view;
use crate::types::{CameraView, Diagnostic};
use crate::utils::parser::parse_openscad_stderr;
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, State};

// Global state for editor content
pub struct EditorState {
    pub current_code: Mutex<String>,
    pub diagnostics: Mutex<Vec<Diagnostic>>,
    pub last_preview_path: Mutex<String>,
    pub openscad_path: Mutex<String>,
    pub working_dir: Mutex<Option<String>>,
}

impl Default for EditorState {
    fn default() -> Self {
        Self {
            current_code: Mutex::new(
                "// Type your OpenSCAD code here\ncube([10, 10, 10]);".to_string(),
            ),
            diagnostics: Mutex::new(Vec::new()),
            last_preview_path: Mutex::new(String::new()),
            openscad_path: Mutex::new("openscad".to_string()),
            working_dir: Mutex::new(None),
        }
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub struct EditValidation {
    pub ok: bool,
    pub error: Option<String>,
    pub lines_changed: usize,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ApplyEditResult {
    pub success: bool,
    pub error: Option<String>,
    pub diagnostics: Vec<Diagnostic>,
    pub checkpoint_id: Option<String>, // ID of checkpoint created before edit
}

/// Update editor state with current code (called when user types)
#[tauri::command]
pub fn update_editor_state(code: String, state: State<'_, EditorState>) -> Result<(), String> {
    *state.current_code.lock().unwrap() = code;
    Ok(())
}

/// Update openscad path in editor state (called when openscad is detected)
#[tauri::command]
pub fn update_openscad_path(
    openscad_path: String,
    state: State<'_, EditorState>,
) -> Result<(), String> {
    *state.openscad_path.lock().unwrap() = openscad_path;
    Ok(())
}

/// Update working directory in editor state (called when file is opened/saved)
#[tauri::command]
pub fn update_working_dir(
    working_dir: Option<String>,
    state: State<'_, EditorState>,
) -> Result<(), String> {
    *state.working_dir.lock().unwrap() = working_dir;
    Ok(())
}

/// Get current code from editor
#[tauri::command]
pub fn get_current_code(state: State<'_, EditorState>) -> Result<String, String> {
    let code = state.current_code.lock().unwrap().clone();
    Ok(code)
}

/// Get preview screenshot path, optionally from a specific camera view
#[tauri::command]
pub async fn get_preview_screenshot(
    app: AppHandle,
    state: State<'_, EditorState>,
    view: Option<String>,
) -> Result<String, String> {
    // If a view is specified, render a new screenshot from that angle
    if let Some(view_name) = view {
        let camera_view = CameraView::from_str(&view_name)?;
        let code = state.current_code.lock().unwrap().clone();
        let openscad_path = state.openscad_path.lock().unwrap().clone();
        let working_dir = state.working_dir.lock().unwrap().clone();

        if code.is_empty() {
            return Err("No code to render. Add some OpenSCAD code first.".to_string());
        }

        // Render with the specified view
        let path = render_with_view(app, openscad_path, code, camera_view, working_dir).await?;
        Ok(path)
    } else {
        // Return the existing preview path
        let path = state.last_preview_path.lock().unwrap().clone();
        if path.is_empty() {
            Ok("No preview available yet. Trigger a render first.".to_string())
        } else {
            Ok(path)
        }
    }
}

/// Validate a string replacement edit
#[tauri::command]
pub fn validate_edit(
    old_string: String,
    new_string: String,
    state: State<'_, EditorState>,
) -> Result<EditValidation, String> {
    let current_code = state.current_code.lock().unwrap().clone();

    // Check if old_string exists in the code
    if !current_code.contains(&old_string) {
        return Ok(EditValidation {
            ok: false,
            error: Some("The old_string was not found in the current code. Make sure you copy the exact text including whitespace.".to_string()),
            lines_changed: 0,
        });
    }

    // Check if old_string appears multiple times (must be unique)
    let occurrences = current_code.matches(&old_string).count();
    if occurrences > 1 {
        return Ok(EditValidation {
            ok: false,
            error: Some(format!("The old_string appears {occurrences} times in the code. It must be unique. Include more surrounding context to make it unique.")),
            lines_changed: 0,
        });
    }

    // Count lines changed
    let old_lines = old_string.lines().count();
    let new_lines = new_string.lines().count();
    let lines_changed = old_lines.max(new_lines);

    // Check line limit
    if lines_changed > 120 {
        return Ok(EditValidation {
            ok: false,
            error: Some(format!("Edit too large: {lines_changed} lines changed (max 120). Please break into smaller changes.")),
            lines_changed,
        });
    }

    Ok(EditValidation {
        ok: true,
        error: None,
        lines_changed,
    })
}

/// Apply a string replacement edit and test compile
#[tauri::command]
pub async fn apply_edit(
    app: AppHandle,
    old_string: String,
    new_string: String,
    state: State<'_, EditorState>,
    openscad_path: String,
) -> Result<ApplyEditResult, String> {
    let current_code = state.current_code.lock().unwrap().clone();

    // Create checkpoint before applying AI edit
    use crate::history::HistoryState;
    use crate::types::ChangeType;
    let checkpoint_id = if let Some(history_state) = app.try_state::<HistoryState>() {
        let diagnostics = state.diagnostics.lock().unwrap().clone();
        let mut history = history_state.history.lock().unwrap();
        let id = history.create_checkpoint(
            current_code.clone(),
            diagnostics,
            "Before AI edit".to_string(),
            ChangeType::Ai,
        );
        eprintln!("[AI Tools] Created checkpoint before applying edit: {id}");
        Some(id)
    } else {
        None
    };

    // Check if old_string exists
    if !current_code.contains(&old_string) {
        return Ok(ApplyEditResult {
            success: false,
            error: Some("The old_string was not found in the current code.".to_string()),
            diagnostics: vec![],
            checkpoint_id: None,
        });
    }

    // Check uniqueness
    let occurrences = current_code.matches(&old_string).count();
    if occurrences > 1 {
        return Ok(ApplyEditResult {
            success: false,
            error: Some(format!(
                "The old_string appears {occurrences} times. It must be unique."
            )),
            diagnostics: vec![],
            checkpoint_id: None,
        });
    }

    // Apply the replacement
    let new_code = current_code.replace(&old_string, &new_string);

    // Test compile with OpenSCAD
    let old_error_count = state
        .diagnostics
        .lock()
        .unwrap()
        .iter()
        .filter(|d| d.severity.is_error())
        .count();

    let test_diagnostics = match test_compile(&new_code, &openscad_path, &app).await {
        Ok(diags) => diags,
        Err(e) => {
            return Ok(ApplyEditResult {
                success: false,
                error: Some(format!("Test compilation failed: {e}")),
                diagnostics: vec![],
                checkpoint_id: None,
            });
        }
    };

    let new_error_count = test_diagnostics
        .iter()
        .filter(|d| d.severity.is_error())
        .count();

    // Check if new errors were introduced
    if new_error_count > old_error_count {
        return Ok(ApplyEditResult {
            success: false,
            error: Some("New compilation errors introduced".to_string()),
            diagnostics: test_diagnostics,
            checkpoint_id: None,
        });
    }

    // Apply changes to state
    let code_len = new_code.len();
    eprintln!("[AI Tools] Updating state with new code (length: {code_len})");
    *state.current_code.lock().unwrap() = new_code.clone();
    *state.diagnostics.lock().unwrap() = test_diagnostics.clone();

    // Emit code update to frontend
    eprintln!(
        "[AI Tools] Emitting code-updated event with payload length: {}",
        new_code.len()
    );
    if let Err(e) = app.emit("code-updated", &new_code) {
        eprintln!("[AI Tools] ❌ Failed to emit code-updated: {e}");
    } else {
        eprintln!("[AI Tools] ✅ code-updated event emitted successfully");
    }

    // Small delay to ensure frontend processes the code update before render
    tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;

    // Trigger a render to show the changes
    eprintln!("[AI Tools] Emitting render-requested event");
    if let Err(e) = app.emit("render-requested", ()) {
        eprintln!("[AI Tools] ❌ Failed to emit render-requested: {e}");
    } else {
        eprintln!("[AI Tools] ✅ render-requested event emitted successfully");
    }

    Ok(ApplyEditResult {
        success: true,
        error: None,
        diagnostics: test_diagnostics,
        checkpoint_id,
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
        .map_err(|e| format!("Failed to get cache dir: {e}"))?;

    std::fs::create_dir_all(&app_dir).map_err(|e| format!("Failed to create cache dir: {e}"))?;

    // Write code to temp file
    let temp_scad = app_dir.join("test_compile.scad");
    std::fs::write(&temp_scad, code).map_err(|e| format!("Failed to write temp file: {e}"))?;

    // Try to compile with OpenSCAD
    let output = tokio::process::Command::new(openscad_path)
        .arg("-o")
        .arg(app_dir.join("test_compile.stl"))
        .arg(&temp_scad)
        .output()
        .await
        .map_err(|e| format!("Failed to run OpenSCAD: {e}"))?;

    // Parse diagnostics from stderr
    let stderr = String::from_utf8_lossy(&output.stderr);
    let diagnostics = parse_openscad_stderr(&stderr);

    // Clean up temp files
    let _ = std::fs::remove_file(&temp_scad);
    let _ = std::fs::remove_file(app_dir.join("test_compile.stl"));

    Ok(diagnostics)
}
