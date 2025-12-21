import { useState, useRef, useEffect, forwardRef, useImperativeHandle } from 'react';
import { convertFileSrc } from '@tauri-apps/api/core';
import type { Message, ToolCallMessage } from '../hooks/useAiAgent';
import { Button } from './ui';
import { ModelSelector } from './ModelSelector';
import { useHistory } from '../hooks/useHistory';

// Helper to extract image path from a tool result
function getImagePathFromResult(result: unknown): string | null {
  console.log('[getImagePathFromResult] Input:', result, 'Type:', typeof result);

  if (!result) return null;

  // If result is a string, try to parse it as JSON
  if (typeof result === 'string') {
    try {
      const parsed = JSON.parse(result);
      console.log('[getImagePathFromResult] Parsed JSON:', parsed);
      if (parsed.image_path) {
        console.log('[getImagePathFromResult] Found image_path:', parsed.image_path);
        return parsed.image_path;
      }
    } catch {
      // Check if it's a direct path to an image
      if (result.endsWith('.png') || result.endsWith('.svg') || result.endsWith('.jpg')) {
        console.log('[getImagePathFromResult] Direct path:', result);
        return result;
      }
    }
  }

  // If result is an object with image_path
  if (typeof result === 'object' && result !== null && 'image_path' in result) {
    const path = (result as { image_path: string }).image_path;
    console.log('[getImagePathFromResult] Object image_path:', path);
    return path;
  }

  console.log('[getImagePathFromResult] No image path found');
  return null;
}

export type AiMode = 'edit';

interface AiPromptPanelProps {
  onSubmit: (prompt: string, mode: AiMode) => void;
  isStreaming: boolean;
  streamingResponse: string | null;
  onCancel: () => void;
  messages?: Message[];
  onNewConversation?: () => void;
  currentToolCalls?: import('../hooks/useAiAgent').ToolCall[];
  currentModel?: string;
  availableProviders?: string[];
  onModelChange?: (model: string) => void;
  onRestoreCheckpoint?: (checkpointId: string, truncatedMessages: Message[]) => void;
}

export interface AiPromptPanelRef {
  focusPrompt: () => void;
}

export const AiPromptPanel = forwardRef<AiPromptPanelRef, AiPromptPanelProps>(
  (
    {
      onSubmit,
      isStreaming,
      streamingResponse,
      onCancel,
      messages = [],
      onNewConversation,
      currentToolCalls = [],
      currentModel = 'claude-sonnet-4-5-20250929',
      availableProviders = [],
      onModelChange,
      onRestoreCheckpoint,
    },
    ref
  ) => {
    const [prompt, setPrompt] = useState('');
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const responseRef = useRef<HTMLDivElement>(null);
    const { restoreToCheckpoint } = useHistory();

    // Expose focusPrompt method to parent
    useImperativeHandle(ref, () => ({
      focusPrompt: () => {
        textareaRef.current?.focus();
      },
    }));

    // Auto-scroll to bottom when messages or streaming response changes
    useEffect(() => {
      if (responseRef.current) {
        responseRef.current.scrollTop = responseRef.current.scrollHeight;
      }
    }, [messages, streamingResponse]);

    // Log when messages or streamingResponse changes
    useEffect(() => {
      console.log('[AiPromptPanel] Messages updated. Count:', messages.length);
      console.log(
        '[AiPromptPanel] Messages:',
        messages.map((m) => ({
          type: m.type,
          id: m.id,
          content: 'content' in m ? (m.content as string).substring(0, 50) : 'N/A',
        }))
      );
    }, [messages]);

    useEffect(() => {
      console.log(
        '[AiPromptPanel] streamingResponse updated:',
        streamingResponse ? streamingResponse.substring(0, 100) + '...' : null
      );
    }, [streamingResponse]);

    useEffect(() => {
      console.log('[AiPromptPanel] currentToolCalls updated:', currentToolCalls);
    }, [currentToolCalls]);

    const handleSubmit = () => {
      if (!prompt.trim() || isStreaming) return;
      onSubmit(prompt, 'edit');
      setPrompt(''); // Clear input after submission
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
      // Enter to submit (unless Shift is held for newline)
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
      // Escape to cancel
      if (e.key === 'Escape' && isStreaming) {
        e.preventDefault();
        onCancel();
      }
    };

    const handleRestoreCheckpoint = async (checkpointId: string, messageId: string) => {
      try {
        // Find this message and check if there are any messages AFTER this user turn
        const messageIndex = messages.findIndex((m) => m.id === messageId);
        const hasLaterMessages = messageIndex !== -1 && messageIndex < messages.length - 1;

        // Only show warning if there are conversation turns after this one
        if (hasLaterMessages) {
          const { confirm } = await import('@tauri-apps/plugin-dialog');
          const shouldProceed = await confirm(
            'This will restore the code to before this turn and remove all subsequent conversation. Continue?',
            {
              title: 'Restore Checkpoint',
              kind: 'warning',
              okLabel: 'Restore',
              cancelLabel: 'Cancel',
            }
          );

          if (!shouldProceed) return;
        }

        // Restore the checkpoint
        await restoreToCheckpoint(checkpointId);

        // Truncate messages - find the index of this message and remove it and everything after
        // (Since we're restoring to BEFORE this user turn)
        if (messageIndex !== -1 && onRestoreCheckpoint) {
          const truncatedMessages = messages.slice(0, messageIndex);
          onRestoreCheckpoint(checkpointId, truncatedMessages);
        }
      } catch (err) {
        console.error('[AiPromptPanel] Failed to restore checkpoint:', err);
        alert(`Failed to restore checkpoint: ${err}`);
      }
    };

    // Auto-focus prompt when not streaming
    useEffect(() => {
      if (!isStreaming && textareaRef.current) {
        textareaRef.current.focus();
      }
    }, [isStreaming]);

    return (
      <div className="h-full flex flex-col" style={{ backgroundColor: 'var(--bg-primary)' }}>
        {/* Compact Toolbar */}
        <div
          className="flex items-center justify-end px-3 py-1"
          style={{
            backgroundColor: 'var(--bg-secondary)',
            borderBottom: '1px solid var(--border-primary)',
          }}
        >
          {onNewConversation && (
            <Button
              size="sm"
              variant="secondary"
              onClick={onNewConversation}
              title="Start new conversation"
              disabled={isStreaming}
            >
              + New
            </Button>
          )}
        </div>

        {/* Empty state spacer or Message history area */}
        {messages.length === 0 && !streamingResponse ? (
          <div
            className="flex-1 flex items-center justify-center px-4"
            style={{ backgroundColor: 'var(--bg-secondary)' }}
          >
            <div className="text-center">
              <div
                className="text-lg font-semibold mb-2"
                style={{ color: 'var(--text-secondary)' }}
              >
                No conversation yet
              </div>
              <div className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
                Describe the changes you want to make below
              </div>
            </div>
          </div>
        ) : (
          <div
            ref={responseRef}
            className="flex-1 overflow-y-auto px-4 py-3 space-y-3"
            style={{
              backgroundColor: 'var(--bg-secondary)',
              borderBottom: '1px solid var(--border-primary)',
            }}
          >
            {messages.map((message) => {
              // User message
              if (message.type === 'user') {
                return (
                  <div key={message.id} className="space-y-1">
                    <div className="flex gap-2 justify-end">
                      <div
                        className="max-w-[85%] rounded-lg px-3 py-2"
                        style={{
                          backgroundColor: 'var(--accent-primary)',
                          color: 'var(--text-inverse)',
                        }}
                      >
                        <div className="text-xs mb-1" style={{ opacity: 0.8 }}>
                          You
                        </div>
                        <div className="text-sm whitespace-pre-wrap font-mono">
                          {message.content}
                        </div>
                      </div>
                    </div>
                    {/* Restore checkpoint button (if AI made changes in response to this) */}
                    {message.checkpointId && (
                      <div className="flex justify-end">
                        <button
                          onClick={() => handleRestoreCheckpoint(message.checkpointId!, message.id)}
                          className="text-xs px-2 py-1 rounded transition-colors hover:bg-opacity-10"
                          style={{
                            color: 'var(--text-tertiary)',
                            backgroundColor: 'transparent',
                            border: '1px solid var(--border-secondary)',
                          }}
                          title="Restore code to before this turn"
                        >
                          ↶ Restore to before this turn
                        </button>
                      </div>
                    )}
                  </div>
                );
              }

              // Assistant text message
              if (message.type === 'assistant') {
                return (
                  <div key={message.id} className="flex gap-2 justify-start">
                    <div
                      className="max-w-[85%] rounded-lg px-3 py-2 border"
                      style={{
                        backgroundColor: 'var(--bg-primary)',
                        color: 'var(--text-primary)',
                        borderColor: 'var(--border-secondary)',
                      }}
                    >
                      <div className="text-xs mb-1" style={{ color: 'var(--text-tertiary)' }}>
                        AI
                      </div>
                      <div className="text-sm whitespace-pre-wrap font-mono">{message.content}</div>
                    </div>
                  </div>
                );
              }

              // Tool call message (permanent, after completion)
              if (message.type === 'tool-call') {
                const toolMessage = message as ToolCallMessage;
                const imagePath =
                  toolMessage.toolName === 'get_preview_screenshot'
                    ? getImagePathFromResult(toolMessage.result)
                    : null;

                if (imagePath) {
                  console.log('[AiPromptPanel] Image path:', imagePath);
                  console.log('[AiPromptPanel] Converted src:', convertFileSrc(imagePath));
                }

                return (
                  <div key={message.id} className="flex gap-2 justify-start">
                    <div
                      className="rounded-lg px-3 py-2 border"
                      style={{
                        backgroundColor: 'var(--bg-primary)',
                        borderColor: message.completed
                          ? 'var(--color-success)'
                          : 'var(--color-warning)',
                      }}
                    >
                      <div className="flex items-center gap-2 text-sm">
                        {message.completed ? (
                          <span style={{ color: 'var(--color-success)' }}>✓</span>
                        ) : (
                          <svg
                            className="animate-spin h-4 w-4"
                            style={{ color: 'var(--color-warning)' }}
                            xmlns="http://www.w3.org/2000/svg"
                            fill="none"
                            viewBox="0 0 24 24"
                          >
                            <circle
                              className="opacity-25"
                              cx="12"
                              cy="12"
                              r="10"
                              stroke="currentColor"
                              strokeWidth="4"
                            ></circle>
                            <path
                              className="opacity-75"
                              fill="currentColor"
                              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                            ></path>
                          </svg>
                        )}
                        <span
                          className="font-semibold"
                          style={{
                            color: message.completed
                              ? 'var(--color-success)'
                              : 'var(--color-warning)',
                          }}
                        >
                          {message.toolName}
                        </span>
                        {message.completed && (
                          <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                            completed
                          </span>
                        )}
                      </div>
                      {/* Display image for get_preview_screenshot tool */}
                      {imagePath && (
                        <div className="mt-2">
                          <img
                            src={`${convertFileSrc(imagePath)}?t=${Date.now()}`}
                            alt={`Preview - ${toolMessage.args?.view || 'default'}`}
                            className="max-w-full rounded border"
                            style={{
                              maxHeight: '300px',
                              borderColor: 'var(--border-secondary)',
                            }}
                            onError={(e) => {
                              console.error('[AiPromptPanel] Failed to load image:', imagePath, e);
                            }}
                          />
                          {typeof toolMessage.args?.view === 'string' && (
                            <div className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
                              View: {toolMessage.args.view}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              }

              // Tool result messages are no longer used
              return null;
            })}
            {/* Current tool calls - shown even without text */}
            {currentToolCalls.length > 0 && (
              <div className="flex gap-2 justify-start">
                <div className="space-y-2">
                  {currentToolCalls.map((tool, idx) => {
                    const imagePath =
                      tool.name === 'get_preview_screenshot'
                        ? getImagePathFromResult(tool.result)
                        : null;

                    return (
                      <div
                        key={idx}
                        className="rounded-lg px-3 py-2 border"
                        style={{
                          backgroundColor: 'var(--bg-primary)',
                          borderColor: tool.result
                            ? 'var(--color-success)'
                            : 'var(--color-warning)',
                        }}
                      >
                        <div className="flex items-center gap-2 text-sm">
                          {tool.result ? (
                            <span style={{ color: 'var(--color-success)' }}>✓</span>
                          ) : (
                            <svg
                              className="animate-spin h-4 w-4"
                              style={{ color: 'var(--color-warning)' }}
                              xmlns="http://www.w3.org/2000/svg"
                              fill="none"
                              viewBox="0 0 24 24"
                            >
                              <circle
                                className="opacity-25"
                                cx="12"
                                cy="12"
                                r="10"
                                stroke="currentColor"
                                strokeWidth="4"
                              ></circle>
                              <path
                                className="opacity-75"
                                fill="currentColor"
                                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                              ></path>
                            </svg>
                          )}
                          <span
                            className="font-semibold"
                            style={{
                              color: tool.result ? 'var(--color-success)' : 'var(--color-warning)',
                            }}
                          >
                            {tool.name}
                          </span>
                          {tool.result ? (
                            <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                              completed
                            </span>
                          ) : null}
                        </div>
                        {/* Display image for get_preview_screenshot tool */}
                        {imagePath && (
                          <div className="mt-2">
                            <img
                              src={`${convertFileSrc(imagePath)}?t=${Date.now()}`}
                              alt={`Preview - ${tool.args?.view || 'default'}`}
                              className="max-w-full rounded border"
                              style={{
                                maxHeight: '300px',
                                borderColor: 'var(--border-secondary)',
                              }}
                              onError={(e) => {
                                console.error(
                                  '[AiPromptPanel] Failed to load realtime image:',
                                  imagePath,
                                  e
                                );
                              }}
                            />
                            {typeof tool.args?.view === 'string' && (
                              <div
                                className="text-xs mt-1"
                                style={{ color: 'var(--text-tertiary)' }}
                              >
                                View: {tool.args.view}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            {/* Streaming text response */}
            {streamingResponse && (
              <div className="flex gap-2 justify-start">
                <div
                  className="max-w-[85%] rounded-lg px-3 py-2 border"
                  style={{
                    backgroundColor: 'var(--bg-primary)',
                    color: 'var(--text-primary)',
                    borderColor: 'var(--border-secondary)',
                  }}
                >
                  <div className="text-xs mb-1" style={{ color: 'var(--text-tertiary)' }}>
                    AI
                  </div>
                  <div className="text-sm whitespace-pre-wrap font-mono">{streamingResponse}</div>
                </div>
              </div>
            )}
            {/* Thinking indicator - shown when streaming but no response or active tool calls */}
            {isStreaming &&
              !streamingResponse &&
              currentToolCalls.filter((tc) => !tc.result).length === 0 && (
                <div className="flex gap-2 justify-start">
                  <div
                    className="rounded-lg px-3 py-2 border"
                    style={{
                      backgroundColor: 'var(--bg-primary)',
                      color: 'var(--text-primary)',
                      borderColor: 'var(--border-secondary)',
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <div className="flex gap-1">
                        <div
                          className="w-2 h-2 rounded-full animate-pulse"
                          style={{
                            backgroundColor: 'var(--accent-primary)',
                            animationDelay: '0ms',
                            animationDuration: '1.4s',
                          }}
                        />
                        <div
                          className="w-2 h-2 rounded-full animate-pulse"
                          style={{
                            backgroundColor: 'var(--accent-primary)',
                            animationDelay: '200ms',
                            animationDuration: '1.4s',
                          }}
                        />
                        <div
                          className="w-2 h-2 rounded-full animate-pulse"
                          style={{
                            backgroundColor: 'var(--accent-primary)',
                            animationDelay: '400ms',
                            animationDuration: '1.4s',
                          }}
                        />
                      </div>
                      <span className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
                        Thinking...
                      </span>
                    </div>
                  </div>
                </div>
              )}
          </div>
        )}

        {/* Prompt input area */}
        <div className="p-3 flex gap-2">
          <textarea
            ref={textareaRef}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Describe the changes you want to make..."
            className="flex-1 rounded px-3 py-2 resize-none focus:outline-none focus:ring-2 text-sm"
            style={{
              backgroundColor: 'var(--bg-elevated)',
              color: 'var(--text-primary)',
              borderColor: 'var(--border-primary)',
            }}
            rows={2}
            disabled={isStreaming}
          />
          {isStreaming ? (
            <Button variant="danger" onClick={onCancel}>
              Cancel
            </Button>
          ) : (
            <Button
              variant="primary"
              onClick={handleSubmit}
              disabled={!prompt.trim()}
              title="Submit prompt (↵)"
              style={{
                opacity: !prompt.trim() ? 0.5 : 1,
                cursor: !prompt.trim() ? 'not-allowed' : 'pointer',
              }}
            >
              Send
            </Button>
          )}
        </div>

        {/* Help text and model selector */}
        <div
          className="flex items-center justify-between px-4 py-2 text-xs"
          style={{ color: 'var(--text-tertiary)', borderTop: '1px solid var(--border-primary)' }}
        >
          <div>
            <span className="font-medium">↵</span> to submit •{' '}
            <span className="font-medium">⇧↵</span> for newline •{' '}
            <span className="font-medium">Esc</span> to cancel •{' '}
            <span className="font-medium">⌘K</span> to focus prompt
          </div>
          <div className="flex items-center gap-2">
            <ModelSelector
              currentModel={currentModel}
              availableProviders={availableProviders}
              onChange={(model) => onModelChange?.(model)}
              disabled={isStreaming}
            />
          </div>
        </div>
      </div>
    );
  }
);
