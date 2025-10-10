import { useState, useCallback, useRef, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type { AiMode } from '../components/AiPromptPanel';

export interface AiAgentState {
  isStreaming: boolean;
  streamingResponse: string | null;
  proposedDiff: {
    diff: string;
    rationale: string;
  } | null;
  error: string | null;
  isApplyingDiff: boolean;
}

interface StreamEvent {
  type: 'text' | 'diff_proposed' | 'error' | 'done';
  content?: string;
  diff?: string;
  rationale?: string;
  error?: string;
}

export function useAiAgent() {
  const [state, setState] = useState<AiAgentState>({
    isStreaming: false,
    streamingResponse: null,
    proposedDiff: null,
    error: null,
    isApplyingDiff: false,
  });

  const sidecarRef = useRef<any>(null);
  const streamBufferRef = useRef<string>('');

  // Listen for streaming events from sidecar
  useEffect(() => {
    let unlisten: (() => void) | null = null;

    const setupListener = async () => {
      unlisten = await listen<StreamEvent>('ai-stream', (event) => {
        const payload = event.payload;

        switch (payload.type) {
          case 'text':
            if (payload.content) {
              streamBufferRef.current += payload.content;
              setState((prev) => ({
                ...prev,
                streamingResponse: streamBufferRef.current,
              }));
            }
            break;

          case 'diff_proposed':
            if (payload.diff && payload.rationale) {
              setState((prev) => ({
                ...prev,
                proposedDiff: {
                  diff: payload.diff,
                  rationale: payload.rationale,
                },
                isStreaming: false,
              }));
              streamBufferRef.current = '';
            }
            break;

          case 'error':
            setState((prev) => ({
              ...prev,
              error: payload.error || 'Unknown error occurred',
              isStreaming: false,
            }));
            streamBufferRef.current = '';
            break;

          case 'done':
            setState((prev) => ({
              ...prev,
              isStreaming: false,
            }));
            streamBufferRef.current = '';
            break;
        }
      });
    };

    setupListener();

    return () => {
      if (unlisten) {
        unlisten();
      }
    };
  }, []);

  // Submit prompt to AI agent
  const submitPrompt = useCallback(async (prompt: string, mode: AiMode) => {
    // Check if API key exists
    try {
      const hasKey = await invoke<boolean>('has_api_key');
      if (!hasKey) {
        setState((prev) => ({
          ...prev,
          error: 'Please set your Anthropic API key in Settings first',
        }));
        return;
      }
    } catch (err) {
      setState((prev) => ({
        ...prev,
        error: `Failed to check API key: ${err}`,
      }));
      return;
    }

    // Reset state
    setState({
      isStreaming: true,
      streamingResponse: '',
      proposedDiff: null,
      error: null,
      isApplyingDiff: false,
    });
    streamBufferRef.current = '';

    try {
      // Start sidecar if not running
      if (!sidecarRef.current) {
        const apiKey = await invoke<string>('get_api_key');
        sidecarRef.current = await invoke('start_agent_sidecar', { apiKey });
      }

      // Send query to sidecar
      await invoke('send_agent_query', {
        prompt,
        mode,
      });
    } catch (err) {
      setState((prev) => ({
        ...prev,
        error: `Failed to submit prompt: ${err}`,
        isStreaming: false,
      }));
      streamBufferRef.current = '';
    }
  }, []);

  // Cancel streaming
  const cancelStream = useCallback(async () => {
    try {
      await invoke('cancel_agent_stream');
      setState((prev) => ({
        ...prev,
        isStreaming: false,
      }));
      streamBufferRef.current = '';
    } catch (err) {
      console.error('Failed to cancel stream:', err);
    }
  }, []);

  // Accept proposed diff
  const acceptDiff = useCallback(async () => {
    if (!state.proposedDiff) return;

    setState((prev) => ({
      ...prev,
      isApplyingDiff: true,
      error: null,
    }));

    try {
      const result = await invoke<{
        success: boolean;
        error?: string;
      }>('apply_diff', {
        diff: state.proposedDiff.diff,
        openscadPath: 'openscad', // TODO: Get from app state
      });

      if (result.success) {
        // Clear diff on success
        setState((prev) => ({
          ...prev,
          proposedDiff: null,
          isApplyingDiff: false,
        }));
      } else {
        setState((prev) => ({
          ...prev,
          error: result.error || 'Failed to apply diff',
          isApplyingDiff: false,
        }));
      }
    } catch (err) {
      setState((prev) => ({
        ...prev,
        error: `Failed to apply diff: ${err}`,
        isApplyingDiff: false,
      }));
    }
  }, [state.proposedDiff]);

  // Reject proposed diff
  const rejectDiff = useCallback(() => {
    setState((prev) => ({
      ...prev,
      proposedDiff: null,
    }));
  }, []);

  // Clear error
  const clearError = useCallback(() => {
    setState((prev) => ({
      ...prev,
      error: null,
    }));
  }, []);

  return {
    ...state,
    submitPrompt,
    cancelStream,
    acceptDiff,
    rejectDiff,
    clearError,
  };
}
