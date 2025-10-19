import { useState, useCallback, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

export interface EditorCheckpoint {
  id: string;
  timestamp: number;
  code: string;
  diagnostics: any[];
  description: string;
  change_type: 'user' | 'ai' | 'fileload' | 'undo' | 'redo';
}

export interface CheckpointDiff {
  from_id: string;
  to_id: string;
  diff: string;
  added_lines: number;
  removed_lines: number;
}

interface HistoryState {
  canUndo: boolean;
  canRedo: boolean;
  history: EditorCheckpoint[];
}

export function useHistory() {
  const [state, setState] = useState<HistoryState>({
    canUndo: false,
    canRedo: false,
    history: [],
  });

  // Listen for history restore events from backend
  useEffect(() => {
    let unlisten: (() => void) | null = null;

    const setupListener = async () => {
      unlisten = await listen<EditorCheckpoint>('history:restore', (event) => {
        console.log('[useHistory] Received history:restore event:', event.payload);
        // State will be updated by refreshing can_undo/can_redo
        refreshHistoryState();
      });
    };

    setupListener();

    return () => {
      if (unlisten) {
        unlisten();
      }
    };
  }, []);

  // Refresh history state (can undo/redo)
  const refreshHistoryState = useCallback(async () => {
    try {
      const [canUndo, canRedo, history] = await Promise.all([
        invoke<boolean>('can_undo'),
        invoke<boolean>('can_redo'),
        invoke<EditorCheckpoint[]>('get_history'),
      ]);

      setState({
        canUndo,
        canRedo,
        history,
      });
    } catch (err) {
      console.error('[useHistory] Failed to refresh history state:', err);
    }
  }, []);

  // Initial load
  useEffect(() => {
    refreshHistoryState();
  }, [refreshHistoryState]);

  // Create checkpoint
  const createCheckpoint = useCallback(async (
    code: string,
    description: string,
    changeType: 'user' | 'ai' | 'fileload' | 'undo' | 'redo' = 'user'
  ): Promise<string> => {
    try {
      const id = await invoke<string>('create_checkpoint', {
        code,
        description,
        changeType,
      });
      await refreshHistoryState();
      return id;
    } catch (err) {
      console.error('[useHistory] Failed to create checkpoint:', err);
      throw err;
    }
  }, [refreshHistoryState]);

  // Undo
  const undo = useCallback(async (): Promise<EditorCheckpoint | null> => {
    try {
      const checkpoint = await invoke<EditorCheckpoint>('undo');
      await refreshHistoryState();
      return checkpoint;
    } catch (err) {
      console.error('[useHistory] Failed to undo:', err);
      return null;
    }
  }, [refreshHistoryState]);

  // Redo
  const redo = useCallback(async (): Promise<EditorCheckpoint | null> => {
    try {
      const checkpoint = await invoke<EditorCheckpoint>('redo');
      await refreshHistoryState();
      return checkpoint;
    } catch (err) {
      console.error('[useHistory] Failed to redo:', err);
      return null;
    }
  }, [refreshHistoryState]);

  // Restore to specific checkpoint
  const restoreToCheckpoint = useCallback(async (checkpointId: string): Promise<EditorCheckpoint | null> => {
    try {
      const checkpoint = await invoke<EditorCheckpoint>('restore_to_checkpoint', {
        checkpointId,
      });
      await refreshHistoryState();
      return checkpoint;
    } catch (err) {
      console.error('[useHistory] Failed to restore checkpoint:', err);
      return null;
    }
  }, [refreshHistoryState]);

  // Get diff between checkpoints
  const getCheckpointDiff = useCallback(async (fromId: string, toId: string): Promise<CheckpointDiff | null> => {
    try {
      return await invoke<CheckpointDiff>('get_checkpoint_diff', {
        fromId,
        toId,
      });
    } catch (err) {
      console.error('[useHistory] Failed to get checkpoint diff:', err);
      return null;
    }
  }, []);

  return {
    ...state,
    createCheckpoint,
    undo,
    redo,
    restoreToCheckpoint,
    getCheckpointDiff,
    refreshHistoryState,
  };
}
