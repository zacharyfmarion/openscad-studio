import { useState, useCallback, useRef, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type { AiMode } from '../components/AiPromptPanel';
import { getProviderFromModel } from '../constants/models';

export interface ToolCall {
  name: string;
  args?: any;
  result?: any;
}

// Base message type
export interface BaseMessage {
  id: string;
  timestamp: number;
}

// User message
export interface UserMessage extends BaseMessage {
  type: 'user';
  content: string;
  checkpointId?: string;  // Checkpoint ID from AI edits in response to this message
}

// Assistant text response
export interface AssistantMessage extends BaseMessage {
  type: 'assistant';
  content: string;
}

// Tool call message
export interface ToolCallMessage extends BaseMessage {
  type: 'tool-call';
  toolName: string;
  args?: any;
  completed?: boolean;  // Whether the tool has completed
}

// Tool result message
export interface ToolResultMessage extends BaseMessage {
  type: 'tool-result';
  toolName: string;
  result: any;
}

export type Message = UserMessage | AssistantMessage | ToolCallMessage | ToolResultMessage;

// Legacy Message type for backward compatibility with saved conversations
export interface LegacyMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  toolCalls?: ToolCall[];
}

export interface Conversation {
  id: string;
  title: string;
  timestamp: number;
  messages: Message[];
}

export interface AiAgentState {
  isStreaming: boolean;
  streamingResponse: string | null;
  proposedDiff: {
    diff: string;
    rationale: string;
  } | null;
  error: string | null;
  isApplyingDiff: boolean;
  messages: Message[];
  conversations: Conversation[];
  currentConversationId: string | null;
  currentToolCalls: ToolCall[];  // Real-time tool calls for current streaming response
  currentModel: string;  // Currently selected model for this session
  availableProviders: string[];  // Providers with API keys
}

interface StreamEvent {
  type: 'text' | 'diff_proposed' | 'error' | 'done' | 'tool-call' | 'tool-result';
  content?: string;
  diff?: string;
  rationale?: string;
  error?: string;
  toolName?: string;
  args?: any;
  result?: any;
}

// Helper to convert new message format to legacy format for backend
function convertMessagesToLegacy(messages: Message[]): LegacyMessage[] {
  const legacyMessages: LegacyMessage[] = [];
  let currentAssistantContent = '';
  let currentToolCalls: ToolCall[] = [];

  for (const message of messages) {
    if (message.type === 'user') {
      // Flush any pending assistant message
      if (currentAssistantContent || currentToolCalls.length > 0) {
        legacyMessages.push({
          role: 'assistant',
          content: currentAssistantContent,
          timestamp: Date.now(),
          toolCalls: currentToolCalls.length > 0 ? currentToolCalls : undefined,
        });
        currentAssistantContent = '';
        currentToolCalls = [];
      }
      // Add user message
      legacyMessages.push({
        role: 'user',
        content: message.content,
        timestamp: message.timestamp,
      });
    } else if (message.type === 'assistant') {
      // Accumulate assistant text
      if (currentAssistantContent) currentAssistantContent += '\n';
      currentAssistantContent += message.content;
    } else if (message.type === 'tool-call') {
      // Accumulate tool call
      currentToolCalls.push({
        name: message.toolName,
        args: message.args,
      });
    } else if (message.type === 'tool-result') {
      // Find matching tool call and add result
      const toolCall = currentToolCalls.find(tc => tc.name === message.toolName && !tc.result);
      if (toolCall) {
        toolCall.result = message.result;
      }
    }
  }

  // Flush final assistant message
  if (currentAssistantContent || currentToolCalls.length > 0) {
    legacyMessages.push({
      role: 'assistant',
      content: currentAssistantContent,
      timestamp: Date.now(),
      toolCalls: currentToolCalls.length > 0 ? currentToolCalls : undefined,
    });
  }

  return legacyMessages;
}

export function useAiAgent() {
  const [state, setState] = useState<AiAgentState>({
    isStreaming: false,
    streamingResponse: null,
    proposedDiff: null,
    error: null,
    isApplyingDiff: false,
    messages: [],
    conversations: [],
    currentConversationId: null,
    currentToolCalls: [],
    currentModel: 'claude-sonnet-4-5-20250929',  // Default, will be loaded from settings
    availableProviders: [],
  });

  const sidecarRef = useRef<any>(null);
  const streamBufferRef = useRef<string>('');
  const lastChunkRef = useRef<string>('');
  const currentToolCallsRef = useRef<ToolCall[]>([]);
  const lastModeRef = useRef<'text' | 'tool' | null>(null); // Track what we were doing last
  const pendingCheckpointIdRef = useRef<string | null>(null); // Checkpoint ID from last tool result

  // Load conversations, model, and available providers on mount
  useEffect(() => {
    loadConversations();
    loadModelAndProviders();
  }, []);

  const loadModelAndProviders = useCallback(async () => {
    try {
      // Load current model from settings
      const model = await invoke<string>('get_ai_model');

      // Load available providers
      const providers = await invoke<string[]>('get_available_providers');

      setState((prev) => ({
        ...prev,
        currentModel: model,
        availableProviders: providers,
      }));

      console.log('[useAiAgent] Loaded model:', model, 'Available providers:', providers);
    } catch (err) {
      console.error('Failed to load model and providers:', err);
    }
  }, []);

  // Listen for streaming events from sidecar
  useEffect(() => {
    let unlisten: (() => void) | null = null;

    const setupListener = async () => {
      console.log('[useAiAgent] Setting up ai-stream event listener');
      unlisten = await listen<StreamEvent>('ai-stream', (event) => {
        console.log('[useAiAgent] Received ai-stream event:', event.payload);
        const payload = event.payload;

        switch (payload.type) {
          case 'text':
            if (payload.content) {
              // Deduplicate: ignore if this is the same as the last chunk
              if (payload.content === lastChunkRef.current) {
                console.log('[useAiAgent] Skipping duplicate chunk');
                break;
              }
              lastChunkRef.current = payload.content;

              // If we were in tool mode, flush the tools first
              if (lastModeRef.current === 'tool' && currentToolCallsRef.current.length > 0) {
                console.log('[useAiAgent] Switching from tool to text mode, flushing tools');
                // Add completed tools as permanent messages
                const toolMessages = currentToolCallsRef.current.map(tool => ({
                  type: 'tool-call' as const,
                  id: crypto.randomUUID(),
                  timestamp: Date.now(),
                  toolName: tool.name,
                  args: tool.args,
                  completed: !!tool.result,
                }));

                setState((prev) => ({
                  ...prev,
                  messages: [...prev.messages, ...toolMessages],
                  currentToolCalls: [],
                }));
                currentToolCallsRef.current = [];
              }

              // Now we're in text mode
              lastModeRef.current = 'text';
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
                  diff: payload.diff!,
                  rationale: payload.rationale!,
                },
                isStreaming: false,
              }));
              streamBufferRef.current = '';
            }
            break;

          case 'tool-call':
            if (payload.toolName) {
              console.log('[useAiAgent] Tool call:', payload.toolName);

              // If we were in text mode, flush the text first
              if (lastModeRef.current === 'text' && streamBufferRef.current.trim()) {
                console.log('[useAiAgent] Switching from text to tool mode, flushing text');
                const assistantMessage: AssistantMessage = {
                  type: 'assistant',
                  id: crypto.randomUUID(),
                  content: streamBufferRef.current,
                  timestamp: Date.now(),
                };

                setState((prev) => ({
                  ...prev,
                  messages: [...prev.messages, assistantMessage],
                  streamingResponse: null,
                }));
                streamBufferRef.current = '';
              }

              // Now we're in tool mode
              lastModeRef.current = 'tool';

              // Track in currentToolCalls for real-time display
              const newToolCall = {
                name: payload.toolName,
                args: payload.args,
              };
              currentToolCallsRef.current.push(newToolCall);
              setState((prev) => ({
                ...prev,
                currentToolCalls: [...currentToolCallsRef.current],
              }));
            }
            break;

          case 'tool-result':
            if (payload.toolName) {
              console.log('[useAiAgent] Tool result:', payload.toolName);

              // Check for checkpoint marker in result (from apply_edit tool)
              if (payload.result && typeof payload.result === 'string') {
                const checkpointMatch = payload.result.match(/\[CHECKPOINT:([\w-]+)\]/);
                if (checkpointMatch) {
                  pendingCheckpointIdRef.current = checkpointMatch[1];
                  console.log('[useAiAgent] Extracted checkpoint ID from tool result:', pendingCheckpointIdRef.current);
                }
              }

              // Update the tool call with result (for checkmark display)
              const toolCall = currentToolCallsRef.current.find(tc => tc.name === payload.toolName && !tc.result);
              if (toolCall) {
                toolCall.result = payload.result;
                setState((prev) => ({
                  ...prev,
                  currentToolCalls: [...currentToolCallsRef.current],
                }));
              }
            }
            break;

          case 'error':
            setState((prev) => ({
              ...prev,
              error: payload.error || 'Unknown error occurred',
              isStreaming: false,
            }));
            streamBufferRef.current = '';
            currentToolCallsRef.current = [];
            setState((prev) => ({ ...prev, currentToolCalls: [] }));
            break;

          case 'done':
            console.log('[useAiAgent] ===== DONE EVENT RECEIVED =====');
            console.log('[useAiAgent] streamBufferRef.current:', streamBufferRef.current);
            console.log('[useAiAgent] currentToolCallsRef.current:', currentToolCallsRef.current);
            console.log('[useAiAgent] lastModeRef.current:', lastModeRef.current);

            // Capture ref values before resetting
            const finalStreamBuffer = streamBufferRef.current;
            const finalToolCalls = [...currentToolCallsRef.current];

            // Flush any remaining content
            setState((prev) => {
              console.log('[useAiAgent] Current messages count before flush:', prev.messages.length);
              console.log('[useAiAgent] Current streamingResponse:', prev.streamingResponse);

              const newMessages = [...prev.messages];

              // Flush remaining tools if any
              if (finalToolCalls.length > 0) {
                console.log('[useAiAgent] Flushing', finalToolCalls.length, 'remaining tool calls');
                const toolMessages = finalToolCalls.map(tool => ({
                  type: 'tool-call' as const,
                  id: crypto.randomUUID(),
                  timestamp: Date.now(),
                  toolName: tool.name,
                  args: tool.args,
                  completed: !!tool.result,
                }));
                newMessages.push(...toolMessages);
              }

              // Flush remaining text if any
              if (finalStreamBuffer && finalStreamBuffer.trim()) {
                console.log('[useAiAgent] Flushing final text on done. Length:', finalStreamBuffer.length);
                console.log('[useAiAgent] Final text content:', finalStreamBuffer);
                const assistantMessage: AssistantMessage = {
                  type: 'assistant',
                  id: crypto.randomUUID(),
                  content: finalStreamBuffer,
                  timestamp: Date.now(),
                };

                newMessages.push(assistantMessage);
              } else {
                console.log('[useAiAgent] No text to flush (finalStreamBuffer is empty or whitespace)');
              }

              // Attach checkpoint ID to the last user message if we have one
              if (pendingCheckpointIdRef.current) {
                console.log('[useAiAgent] Attaching checkpoint ID to last user message:', pendingCheckpointIdRef.current);
                // Find the last user message and attach checkpoint
                for (let i = newMessages.length - 1; i >= 0; i--) {
                  if (newMessages[i].type === 'user') {
                    (newMessages[i] as UserMessage).checkpointId = pendingCheckpointIdRef.current;
                    console.log('[useAiAgent] Attached checkpoint to user message:', newMessages[i].id);
                    break;
                  }
                }
                pendingCheckpointIdRef.current = null;  // Clear after use
              }

              console.log('[useAiAgent] Final messages count after flush:', newMessages.length);
              console.log('[useAiAgent] Final messages:', newMessages.map(m => ({ type: m.type, id: m.id, content: 'content' in m ? m.content.substring(0, 50) : 'N/A' })));

              // Save conversation after adding message
              setTimeout(() => saveConversation(), 100);

              return {
                ...prev,
                isStreaming: false,
                streamingResponse: null,
                messages: newMessages,
                currentToolCalls: [],  // Clear real-time tool calls
              };
            });

            // Reset all refs AFTER capturing values
            console.log('[useAiAgent] Resetting refs');
            streamBufferRef.current = '';
            currentToolCallsRef.current = [];
            lastModeRef.current = null;
            // Note: pendingCheckpointIdRef is cleared when attached to message, not here
            console.log('[useAiAgent] ===== DONE EVENT PROCESSED =====');
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

  // Load conversations from storage
  const loadConversations = useCallback(async () => {
    try {
      const convos = await invoke<Conversation[]>('load_conversations');
      setState((prev) => ({ ...prev, conversations: convos || [] }));
    } catch (err) {
      console.error('Failed to load conversations:', err);
    }
  }, []);

  // Save current conversation
  const saveConversation = useCallback(async () => {
    if (!state.currentConversationId || state.messages.length === 0) return;

    // Get title from first user message
    const firstUserMessage = state.messages.find(m => m.type === 'user') as UserMessage | undefined;
    const title = firstUserMessage?.content.slice(0, 50) || 'New Conversation';

    const conversation: Conversation = {
      id: state.currentConversationId,
      title,
      timestamp: Date.now(),
      messages: state.messages,
    };

    try {
      await invoke('save_conversation', { conversation });
      await loadConversations();
    } catch (err) {
      console.error('Failed to save conversation:', err);
    }
  }, [state.currentConversationId, state.messages, loadConversations]);

  // Start new conversation
  const newConversation = useCallback(() => {
    setState((prev) => ({
      ...prev,
      currentConversationId: crypto.randomUUID(),
      messages: [],
      streamingResponse: null,
      error: null,
    }));
  }, []);

  // Load a conversation
  const loadConversation = useCallback((conversationId: string) => {
    const convo = state.conversations.find((c) => c.id === conversationId);
    if (convo) {
      setState((prev) => ({
        ...prev,
        currentConversationId: convo.id,
        messages: convo.messages,
        streamingResponse: null,
        error: null,
      }));
    }
  }, [state.conversations]);

  // Submit prompt to AI agent
  const submitPrompt = useCallback(async (prompt: string, mode: AiMode) => {
    console.log('[useAiAgent] submitPrompt called', { prompt, mode });

    // Check if API key exists
    try {
      console.log('[useAiAgent] Checking for API key...');
      const hasKey = await invoke<boolean>('has_api_key');
      console.log('[useAiAgent] Has API key:', hasKey);
      if (!hasKey) {
        setState((prev) => ({
          ...prev,
          error: 'Please set your API key in Settings first',
        }));
        return;
      }
    } catch (err) {
      console.error('[useAiAgent] Failed to check API key:', err);
      setState((prev) => ({
        ...prev,
        error: `Failed to check API key: ${err}`,
      }));
      return;
    }

    // Create new conversation if needed
    const conversationId = state.currentConversationId || crypto.randomUUID();

    // Add user message
    const userMessage: UserMessage = {
      type: 'user',
      id: crypto.randomUUID(),
      content: prompt,
      timestamp: Date.now(),
    };

    const updatedMessages = [...state.messages, userMessage];

    // Reset streaming state
    console.log('[useAiAgent] Starting stream with', updatedMessages.length, 'messages');
    setState((prev) => ({
      ...prev,
      isStreaming: true,
      streamingResponse: '',
      proposedDiff: null,
      error: null,
      isApplyingDiff: false,
      messages: updatedMessages,
      currentConversationId: conversationId,
      currentToolCalls: [],  // Reset real-time tool calls
    }));
    streamBufferRef.current = '';
    lastChunkRef.current = '';
    currentToolCallsRef.current = [];
    lastModeRef.current = null;
    pendingCheckpointIdRef.current = null;

    try {
      // Start sidecar if not running
      if (!sidecarRef.current) {
        console.log('[useAiAgent] Starting sidecar...');
        const provider = await invoke<string>('get_ai_provider');
        const apiKey = await invoke<string>('get_api_key');
        const model = await invoke<string>('get_ai_model');
        console.log('[useAiAgent] Got API key for provider:', provider, 'model:', model);
        await invoke('start_ai_agent', { apiKey, provider });
        console.log('[useAiAgent] Sidecar started successfully');
        sidecarRef.current = true;
      } else {
        console.log('[useAiAgent] Sidecar already running');
      }

      // Convert to legacy format for backend
      const legacyMessages = convertMessagesToLegacy(updatedMessages);

      // Determine provider from current model
      const provider = getProviderFromModel(state.currentModel) || 'anthropic';

      // Send query to sidecar with full message history, current model, and provider
      console.log('[useAiAgent] Sending query to sidecar with', legacyMessages.length, 'messages', 'using model:', state.currentModel, 'provider:', provider);
      await invoke('send_ai_query', {
        messages: legacyMessages,
        model: state.currentModel,
        provider,
        mode,
      });
      console.log('[useAiAgent] Query sent successfully');
    } catch (err) {
      console.error('[useAiAgent] Error submitting prompt:', err);
      setState((prev) => ({
        ...prev,
        error: `Failed to submit prompt: ${err}`,
        isStreaming: false,
      }));
      streamBufferRef.current = '';
    }
  }, [state.currentConversationId, state.messages, state.currentModel]);

  // Cancel streaming
  const cancelStream = useCallback(async () => {
    try {
      console.log('[useAiAgent] Cancelling stream...');
      await invoke('cancel_ai_stream');

      // Reset all streaming state
      setState((prev) => ({
        ...prev,
        isStreaming: false,
        streamingResponse: null,
        currentToolCalls: [],
      }));

      // Reset refs
      streamBufferRef.current = '';
      currentToolCallsRef.current = [];
      lastModeRef.current = null;
      lastChunkRef.current = '';
      pendingCheckpointIdRef.current = null;

      console.log('[useAiAgent] Stream cancelled successfully');
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

  // Set current model
  const setCurrentModel = useCallback((model: string) => {
    console.log('[useAiAgent] Setting current model to:', model);
    setState((prev) => ({
      ...prev,
      currentModel: model,
    }));
  }, []);

  // Handle checkpoint restoration with conversation truncation
  const handleRestoreCheckpoint = useCallback((checkpointId: string, truncatedMessages: Message[]) => {
    console.log('[useAiAgent] Restoring checkpoint and truncating conversation:', checkpointId);
    setState((prev) => ({
      ...prev,
      messages: truncatedMessages,
    }));

    // Save the truncated conversation
    setTimeout(() => saveConversation(), 100);
  }, [saveConversation]);

  return {
    ...state,
    submitPrompt,
    cancelStream,
    acceptDiff,
    rejectDiff,
    clearError,
    newConversation,
    loadConversation,
    saveConversation,
    setCurrentModel,
    loadModelAndProviders,
    handleRestoreCheckpoint,
  };
}
