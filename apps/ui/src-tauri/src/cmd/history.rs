/**
 * History-related Tauri commands
 */

use tauri::{AppHandle, State, Emitter};
use crate::history::HistoryState;
use crate::types::{EditorCheckpoint, ChangeType, CheckpointDiff};
use crate::cmd::EditorState;

/// Create a checkpoint in the history
#[tauri::command]
pub fn create_checkpoint(
    code: String,
    description: String,
    change_type: ChangeType,
    editor_state: State<'_, EditorState>,
    history_state: State<'_, HistoryState>,
) -> Result<String, String> {
    let diagnostics = editor_state.diagnostics.lock().unwrap().clone();

    let mut history = history_state.history.lock().unwrap();
    let id = history.create_checkpoint(code, diagnostics, description, change_type);

    Ok(id)
}

/// Undo to previous checkpoint
#[tauri::command]
pub fn undo(
    app: AppHandle,
    history_state: State<'_, HistoryState>,
    editor_state: State<'_, EditorState>,
) -> Result<EditorCheckpoint, String> {
    let mut history = history_state.history.lock().unwrap();

    if let Some(checkpoint) = history.undo() {
        // Update editor state
        *editor_state.current_code.lock().unwrap() = checkpoint.code.clone();
        *editor_state.diagnostics.lock().unwrap() = checkpoint.diagnostics.clone();

        // Emit event to frontend to update editor
        let _ = app.emit("history:restore", checkpoint.clone());

        Ok(checkpoint.clone())
    } else {
        Err("Cannot undo: no more history".to_string())
    }
}

/// Redo to next checkpoint
#[tauri::command]
pub fn redo(
    app: AppHandle,
    history_state: State<'_, HistoryState>,
    editor_state: State<'_, EditorState>,
) -> Result<EditorCheckpoint, String> {
    let mut history = history_state.history.lock().unwrap();

    if let Some(checkpoint) = history.redo() {
        // Update editor state
        *editor_state.current_code.lock().unwrap() = checkpoint.code.clone();
        *editor_state.diagnostics.lock().unwrap() = checkpoint.diagnostics.clone();

        // Emit event to frontend to update editor
        let _ = app.emit("history:restore", checkpoint.clone());

        Ok(checkpoint.clone())
    } else {
        Err("Cannot redo: already at latest".to_string())
    }
}

/// Get all history checkpoints
#[tauri::command]
pub fn get_history(
    history_state: State<'_, HistoryState>,
) -> Result<Vec<EditorCheckpoint>, String> {
    let history = history_state.history.lock().unwrap();
    Ok(history.get_all())
}

/// Restore to a specific checkpoint
#[tauri::command]
pub fn restore_to_checkpoint(
    app: AppHandle,
    checkpoint_id: String,
    history_state: State<'_, HistoryState>,
    editor_state: State<'_, EditorState>,
) -> Result<EditorCheckpoint, String> {
    let mut history = history_state.history.lock().unwrap();

    if let Some(checkpoint) = history.restore_to(&checkpoint_id) {
        // Update editor state
        *editor_state.current_code.lock().unwrap() = checkpoint.code.clone();
        *editor_state.diagnostics.lock().unwrap() = checkpoint.diagnostics.clone();

        // Emit event to frontend to update editor
        let _ = app.emit("history:restore", checkpoint.clone());

        Ok(checkpoint.clone())
    } else {
        Err(format!("Checkpoint not found: {}", checkpoint_id))
    }
}

/// Get diff between two checkpoints
#[tauri::command]
pub fn get_checkpoint_diff(
    from_id: String,
    to_id: String,
    history_state: State<'_, HistoryState>,
) -> Result<CheckpointDiff, String> {
    let history = history_state.history.lock().unwrap();

    history.get_diff(&from_id, &to_id)
        .ok_or_else(|| "Failed to generate diff".to_string())
}

/// Check if undo is available
#[tauri::command]
pub fn can_undo(
    history_state: State<'_, HistoryState>,
) -> Result<bool, String> {
    let history = history_state.history.lock().unwrap();
    Ok(history.can_undo())
}

/// Check if redo is available
#[tauri::command]
pub fn can_redo(
    history_state: State<'_, HistoryState>,
) -> Result<bool, String> {
    let history = history_state.history.lock().unwrap();
    Ok(history.can_redo())
}

/// Get a specific checkpoint by ID
#[tauri::command]
pub fn get_checkpoint_by_id(
    checkpoint_id: String,
    history_state: State<'_, HistoryState>,
) -> Result<EditorCheckpoint, String> {
    let history = history_state.history.lock().unwrap();
    let checkpoints = history.get_all();

    checkpoints
        .into_iter()
        .find(|c| c.id == checkpoint_id)
        .ok_or_else(|| format!("Checkpoint not found: {}", checkpoint_id))
}
