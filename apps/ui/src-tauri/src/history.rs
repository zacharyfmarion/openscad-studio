/**
 * Editor History Management
 *
 * Provides undo/redo functionality with checkpoint system.
 * Tracks up to MAX_CHECKPOINTS snapshots of editor state.
 */

use std::collections::VecDeque;
use std::sync::Mutex;
use crate::types::{EditorCheckpoint, ChangeType, Diagnostic, CheckpointDiff};

const MAX_CHECKPOINTS: usize = 50;

pub struct EditorHistory {
    checkpoints: VecDeque<EditorCheckpoint>,
    current_index: Option<usize>, // None means we're at the latest state (not in history)
}

impl EditorHistory {
    pub fn new() -> Self {
        Self {
            checkpoints: VecDeque::new(),
            current_index: None,
        }
    }

    /// Create a new checkpoint
    pub fn create_checkpoint(
        &mut self,
        code: String,
        diagnostics: Vec<Diagnostic>,
        description: String,
        change_type: ChangeType,
    ) -> String {
        let checkpoint = EditorCheckpoint {
            id: uuid::Uuid::new_v4().to_string(),
            timestamp: chrono::Utc::now().timestamp_millis(),
            code,
            diagnostics,
            description,
            change_type,
        };

        let id = checkpoint.id.clone();

        // If we're not at the latest state (i.e., user has undone and is now making new changes),
        // remove all checkpoints after current position
        if let Some(current) = self.current_index {
            // Remove everything after current_index
            self.checkpoints.truncate(current + 1);
        }

        // Add new checkpoint
        self.checkpoints.push_back(checkpoint);

        // Maintain max size
        if self.checkpoints.len() > MAX_CHECKPOINTS {
            self.checkpoints.pop_front();
        }

        // Reset to latest state
        self.current_index = None;

        id
    }

    /// Get current checkpoint (or latest if at head)
    pub fn get_current(&self) -> Option<&EditorCheckpoint> {
        if let Some(index) = self.current_index {
            self.checkpoints.get(index)
        } else {
            self.checkpoints.back()
        }
    }

    /// Undo to previous checkpoint
    pub fn undo(&mut self) -> Option<&EditorCheckpoint> {
        if self.checkpoints.is_empty() {
            return None;
        }

        let new_index = if let Some(current) = self.current_index {
            // Already in history, go back one more
            if current > 0 {
                current - 1
            } else {
                return None; // Can't go back further
            }
        } else {
            // At latest, go to second-to-last
            let len = self.checkpoints.len();
            if len > 1 {
                len - 2
            } else {
                return None; // Only one checkpoint, can't undo
            }
        };

        self.current_index = Some(new_index);
        self.checkpoints.get(new_index)
    }

    /// Redo to next checkpoint
    pub fn redo(&mut self) -> Option<&EditorCheckpoint> {
        if let Some(current) = self.current_index {
            let new_index = current + 1;
            if new_index < self.checkpoints.len() {
                self.current_index = Some(new_index);
                return self.checkpoints.get(new_index);
            } else if new_index == self.checkpoints.len() {
                // Back to latest
                self.current_index = None;
                return self.checkpoints.back();
            }
        }
        None // Already at latest
    }

    /// Get all checkpoints
    pub fn get_all(&self) -> Vec<EditorCheckpoint> {
        self.checkpoints.iter().cloned().collect()
    }

    /// Get checkpoint by ID
    pub fn get_by_id(&self, id: &str) -> Option<&EditorCheckpoint> {
        self.checkpoints.iter().find(|c| c.id == id)
    }

    /// Restore to specific checkpoint
    pub fn restore_to(&mut self, id: &str) -> Option<&EditorCheckpoint> {
        if let Some(index) = self.checkpoints.iter().position(|c| c.id == id) {
            self.current_index = Some(index);
            self.checkpoints.get(index)
        } else {
            None
        }
    }

    /// Calculate diff between two checkpoints
    pub fn get_diff(&self, from_id: &str, to_id: &str) -> Option<CheckpointDiff> {
        let from = self.get_by_id(from_id)?;
        let to = self.get_by_id(to_id)?;

        // Use similar crate for diff generation
        use similar::{ChangeTag, TextDiff};

        let diff = TextDiff::from_lines(&from.code, &to.code);
        let mut unified_diff = String::new();
        let mut added_lines = 0;
        let mut removed_lines = 0;

        for change in diff.iter_all_changes() {
            match change.tag() {
                ChangeTag::Delete => {
                    unified_diff.push_str(&format!("-{}", change));
                    removed_lines += 1;
                }
                ChangeTag::Insert => {
                    unified_diff.push_str(&format!("+{}", change));
                    added_lines += 1;
                }
                ChangeTag::Equal => {
                    unified_diff.push_str(&format!(" {}", change));
                }
            }
        }

        Some(CheckpointDiff {
            from_id: from_id.to_string(),
            to_id: to_id.to_string(),
            diff: unified_diff,
            added_lines,
            removed_lines,
        })
    }

    /// Check if we can undo
    pub fn can_undo(&self) -> bool {
        if self.checkpoints.is_empty() {
            return false;
        }

        if let Some(current) = self.current_index {
            current > 0
        } else {
            self.checkpoints.len() > 1
        }
    }

    /// Check if we can redo
    pub fn can_redo(&self) -> bool {
        if let Some(current) = self.current_index {
            current < self.checkpoints.len() - 1 || current == self.checkpoints.len() - 1
        } else {
            false // Already at latest
        }
    }

    /// Clear all history
    pub fn clear(&mut self) {
        self.checkpoints.clear();
        self.current_index = None;
    }
}

/// Global history state (managed by Tauri)
pub struct HistoryState {
    pub history: Mutex<EditorHistory>,
}

impl HistoryState {
    pub fn new() -> Self {
        Self {
            history: Mutex::new(EditorHistory::new()),
        }
    }
}

impl Default for HistoryState {
    fn default() -> Self {
        Self::new()
    }
}
