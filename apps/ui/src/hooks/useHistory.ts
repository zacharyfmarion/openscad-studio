import { useState, useCallback, useEffect } from 'react';
import { historyService, eventBus } from '../platform';
import type { EditorCheckpoint, CheckpointDiff } from '../platform';

export type { EditorCheckpoint, CheckpointDiff };

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

  const refreshHistoryState = useCallback(() => {
    setState({
      canUndo: historyService.canUndo(),
      canRedo: historyService.canRedo(),
      history: historyService.getAll(),
    });
  }, []);

  useEffect(() => {
    const unlistenRestore = eventBus.on('history:restore', () => {
      refreshHistoryState();
    });
    const unlistenCodeUpdated = eventBus.on('code-updated', () => {
      refreshHistoryState();
    });
    return () => {
      unlistenRestore();
      unlistenCodeUpdated();
    };
  }, [refreshHistoryState]);

  useEffect(() => {
    refreshHistoryState();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const createCheckpoint = useCallback(
    async (
      code: string,
      description: string,
      changeType: 'user' | 'ai' | 'fileload' | 'undo' | 'redo' = 'user'
    ): Promise<string> => {
      const id = historyService.createCheckpoint(code, [], description, changeType);
      refreshHistoryState();
      return id;
    },
    [refreshHistoryState]
  );

  const undo = useCallback(async (): Promise<EditorCheckpoint | null> => {
    const checkpoint = historyService.undo();
    refreshHistoryState();
    return checkpoint;
  }, [refreshHistoryState]);

  const redo = useCallback(async (): Promise<EditorCheckpoint | null> => {
    const checkpoint = historyService.redo();
    refreshHistoryState();
    return checkpoint;
  }, [refreshHistoryState]);

  const restoreToCheckpoint = useCallback(
    async (checkpointId: string): Promise<EditorCheckpoint | null> => {
      const checkpoint = historyService.restoreTo(checkpointId);
      refreshHistoryState();
      return checkpoint;
    },
    [refreshHistoryState]
  );

  const getCheckpointDiff = useCallback(
    async (fromId: string, toId: string): Promise<CheckpointDiff | null> => {
      return historyService.getDiff(fromId, toId);
    },
    []
  );

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
