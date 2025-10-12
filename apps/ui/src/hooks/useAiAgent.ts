import { useState, useCallback, useRef, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type { AiMode } from '../components/AiPromptPanel';

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
  });

  const sidecarRef = useRef<any>(null);
  const streamBufferRef = useRef<string>('');
  const lastChunkRef = useRef<string>('');
  const currentToolCallsRef = useRef<ToolCall[]>([]);
  const lastModeRef = useRef<'text' | 'tool' | null>(null); // Track what we were doing last

  // Load conversations on mount
  useEffect(() => {
    loadConversations();
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
            // Flush any remaining content
            setState((prev) => {
              const newMessages = [...prev.messages];

              // Flush remaining text if any
              if (streamBufferRef.current && streamBufferRef.current.trim()) {
                console.log('[useAiAgent] Flushing final text on done');
                newMessages.push({
                  type: 'assistant',
                  id: crypto.randomUUID(),
                  content: streamBufferRef.current,
                  timestamp: Date.now(),
                });
              }

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

            // Reset all refs
            streamBufferRef.current = '';
            currentToolCallsRef.current = [];
            lastModeRef.current = null;
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

    try {
      // Start sidecar if not running
      if (!sidecarRef.current) {
        console.log('[useAiAgent] Starting sidecar...');
        const provider = await invoke<string>('get_ai_provider');
        const apiKey = await invoke<string>('get_api_key');
        console.log('[useAiAgent] Got API key for provider:', provider);
        await invoke('start_agent_sidecar', { apiKey, provider });
        console.log('[useAiAgent] Sidecar started successfully');
        sidecarRef.current = true;
      } else {
        console.log('[useAiAgent] Sidecar already running');
      }

      // Convert to legacy format for backend
      const legacyMessages = convertMessagesToLegacy(updatedMessages);

      // Send query to sidecar with full message history
      console.log('[useAiAgent] Sending query to sidecar with', legacyMessages.length, 'messages');
      await invoke('send_agent_query', {
        messages: legacyMessages,
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
  }, [state.currentConversationId, state.messages]);

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
    newConversation,
    loadConversation,
    saveConversation,
  };
}
