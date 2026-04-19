import { useRef, useEffect, useState, forwardRef, useImperativeHandle } from 'react';
import { ChatImage, ChatImageGrid } from './ChatImage';
import { Button } from './ui';
import { MarkdownMessage } from './MarkdownMessage';
import { ModelSelector } from './ModelSelector';
import { AiComposer, type AiComposerRef } from './AiComposer';
import { AiAccessEmptyState } from './AiAccessEmptyState';
import { useAnalytics, type ModelSelectionSurface } from '../analytics/runtime';
import { useHistory } from '../hooks/useHistory';
import { getPlatform } from '../platform';
import { useHasApiKey } from '../stores/apiKeyStore';
import { notifyError, notifySuccess } from '../utils/notifications';
import type {
  AiDraft,
  AssistantMessage,
  AttachmentStore,
  Message,
  ToolCall,
  ToolCallMessage,
  ToolCallState,
} from '../types/aiChat';
import { getUserMessageText } from '../types/aiChat';

const AUTO_SCROLL_BOTTOM_THRESHOLD_PX = 48;

function getImageDataUrlFromResult(result: unknown): string | null {
  if (!result) return null;

  if (typeof result === 'string') {
    if (result.startsWith('data:image/')) return result;
    try {
      const parsed = JSON.parse(result);
      if (parsed.image_data_url) return parsed.image_data_url;
    } catch {
      /* empty */
    }
  }

  if (typeof result === 'object' && result !== null && 'image_data_url' in result) {
    return (result as { image_data_url: string }).image_data_url;
  }

  return null;
}

function getAssistantStateLabel(message: AssistantMessage): string | null {
  if (message.state === 'cancelled') return 'Cancelled';
  if (message.state === 'error') return 'Stopped due to error';
  return null;
}

function getToolStateMeta(state: ToolCallState) {
  switch (state) {
    case 'completed':
      return {
        color: 'var(--color-success)',
        borderColor: 'var(--color-success)',
        label: 'completed',
        icon: <span style={{ color: 'var(--color-success)' }}>✓</span>,
      };
    case 'error':
      return {
        color: 'var(--color-error)',
        borderColor: 'var(--color-error)',
        label: 'error',
        icon: <span style={{ color: 'var(--color-error)' }}>!</span>,
      };
    case 'denied':
      return {
        color: 'var(--color-warning)',
        borderColor: 'var(--color-warning)',
        label: 'denied',
        icon: <span style={{ color: 'var(--color-warning)' }}>•</span>,
      };
    default:
      return {
        color: 'var(--color-warning)',
        borderColor: 'var(--color-warning)',
        label: 'running',
        icon: (
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
        ),
      };
  }
}

function sanitizeToolDetailString(value: string): string {
  if (value.startsWith('data:image/')) {
    return `[image data URL omitted, ${value.length.toLocaleString()} characters]`;
  }

  return value;
}

function sanitizeToolDetailValue(value: unknown, seen = new WeakSet<object>()): unknown {
  if (typeof value === 'string') {
    return sanitizeToolDetailString(value);
  }

  if (
    value === null ||
    value === undefined ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value;
  }

  if (typeof value === 'bigint') {
    return value.toString();
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeToolDetailValue(item, seen));
  }

  if (typeof value === 'object') {
    if (seen.has(value)) {
      return '[Circular]';
    }

    seen.add(value);

    if (value instanceof Error) {
      return {
        name: value.name,
        message: value.message,
        stack: value.stack ? sanitizeToolDetailString(value.stack) : undefined,
      };
    }

    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([key]) => key !== 'rationale' && !key.startsWith('__'))
        .map(([key, entryValue]) => [key, sanitizeToolDetailValue(entryValue, seen)])
    );
  }

  return String(value);
}

function formatToolDetailValue(value: unknown): string {
  if (value === undefined) {
    return '';
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        return JSON.stringify(sanitizeToolDetailValue(JSON.parse(trimmed)), null, 2);
      } catch {
        return sanitizeToolDetailString(value);
      }
    }

    return sanitizeToolDetailString(value);
  }

  try {
    return JSON.stringify(sanitizeToolDetailValue(value), null, 2);
  } catch {
    return String(value);
  }
}

function getMissingToolResultLabel(state: ToolCallState): string {
  if (state === 'pending') return 'Waiting for result...';
  if (state === 'error') return 'No result returned before the tool failed.';
  if (state === 'denied') return 'No result returned because the tool output was denied.';
  return 'No result returned.';
}

function isTranscriptNearBottom(node: HTMLDivElement): boolean {
  return node.scrollHeight - node.scrollTop - node.clientHeight <= AUTO_SCROLL_BOTTOM_THRESHOLD_PX;
}

interface ToolCallDetailSectionProps {
  label: string;
  value?: unknown;
  emptyLabel: string;
}

function ToolCallDetailSection({ label, value, emptyLabel }: ToolCallDetailSectionProps) {
  const formattedValue = value === undefined ? '' : formatToolDetailValue(value);

  return (
    <div className="space-y-1">
      <div
        className="text-[11px] font-semibold uppercase tracking-[0.08em]"
        style={{ color: 'var(--text-tertiary)' }}
      >
        {label}
      </div>
      <div
        className="rounded-md border px-2 py-2"
        style={{
          backgroundColor: 'var(--bg-secondary)',
          borderColor: 'var(--border-secondary)',
        }}
      >
        {formattedValue ? (
          <pre
            className="m-0 whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed"
            style={{ color: 'var(--text-secondary)' }}
          >
            {formattedValue}
          </pre>
        ) : (
          <div className="text-xs italic" style={{ color: 'var(--text-tertiary)' }}>
            {emptyLabel}
          </div>
        )}
      </div>
    </div>
  );
}

interface ToolCallCardProps {
  toolName: string;
  state: ToolCallState;
  args?: Record<string, unknown>;
  result?: unknown;
  errorText?: string;
}

function ToolCallCard({ toolName, state, args, result, errorText }: ToolCallCardProps) {
  const [expanded, setExpanded] = useState(false);
  const toolStateMeta = getToolStateMeta(state);
  const imageDataUrl =
    toolName === 'get_preview_screenshot' ? getImageDataUrlFromResult(result) : null;

  return (
    <div
      className="rounded-lg px-3 py-2 border"
      style={{
        backgroundColor: 'var(--bg-primary)',
        borderColor: toolStateMeta.borderColor,
      }}
    >
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="flex w-full items-center justify-start gap-2 p-0 text-left text-sm"
        style={{ height: 'auto' }}
        onClick={() => setExpanded((current) => !current)}
        aria-expanded={expanded}
        aria-label={`${expanded ? 'Collapse' : 'Expand'} details for ${toolName}`}
      >
        {toolStateMeta.icon}
        <span className="font-semibold" style={{ color: toolStateMeta.color }}>
          {toolName}
        </span>
        <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
          {toolStateMeta.label}
        </span>
        <span className="ml-auto flex h-5 w-5 items-center justify-center">
          <svg
            width="14"
            height="14"
            viewBox="0 0 12 12"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            style={{
              color: 'var(--text-tertiary)',
              transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)',
              transition: 'transform 120ms ease',
            }}
          >
            <path
              d="M4.5 2.5L7.5 6L4.5 9.5"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      </Button>
      {imageDataUrl && !expanded && (
        <div className="mt-2">
          <ChatImage src={imageDataUrl} alt="Preview screenshot" filename="preview.png" />
        </div>
      )}
      {expanded && (
        <div
          className="mt-2 space-y-2 border-t pt-2"
          style={{ borderColor: 'var(--border-secondary)' }}
        >
          {errorText && (
            <div className="text-xs" style={{ color: 'var(--color-error)' }}>
              {errorText}
            </div>
          )}
          {imageDataUrl && (
            <div>
              <ChatImage src={imageDataUrl} alt="Preview screenshot" filename="preview.png" />
            </div>
          )}
          <ToolCallDetailSection label="Input" value={args} emptyLabel="No input parameters." />
          <ToolCallDetailSection
            label="Result"
            value={result}
            emptyLabel={getMissingToolResultLabel(state)}
          />
        </div>
      )}
    </div>
  );
}

export interface AiPromptPanelProps {
  onSubmit: () => void;
  onTextChange: (text: string) => void;
  onFilesSelected: (files: File[]) => void;
  onRemoveAttachment: (attachmentId: string) => void;
  draft: AiDraft;
  attachments: AttachmentStore;
  draftErrors: string[];
  draftVisionBlockMessage?: string | null;
  draftVisionWarningMessage?: string | null;
  canSubmitDraft: boolean;
  isProcessingAttachments: boolean;
  isStreaming: boolean;
  streamingResponse: string | null;
  onCancel: () => void;
  messages?: Message[];
  onNewConversation?: () => void;
  currentToolCalls?: ToolCall[];
  currentModel?: string;
  availableProviders?: string[];
  onModelChange?: (model: string, sourceSurface?: ModelSelectionSurface) => void;
  onRestoreCheckpoint?: (checkpointId: string, truncatedMessages: Message[]) => void;
  onOpenSettings?: () => void;
}

export interface AiPromptPanelRef {
  focusPrompt: () => void;
}

export const AiPromptPanel = forwardRef<AiPromptPanelRef, AiPromptPanelProps>(
  (
    {
      onSubmit,
      onTextChange,
      onFilesSelected,
      onRemoveAttachment,
      draft,
      attachments,
      draftErrors,
      draftVisionBlockMessage,
      draftVisionWarningMessage,
      canSubmitDraft,
      isProcessingAttachments,
      isStreaming,
      streamingResponse,
      onCancel,
      messages = [],
      onNewConversation,
      currentToolCalls = [],
      currentModel = 'claude-sonnet-4-5',
      availableProviders = [],
      onModelChange,
      onRestoreCheckpoint,
      onOpenSettings,
    },
    ref
  ) => {
    const analytics = useAnalytics();
    const hasApiKey = useHasApiKey();
    const responseRef = useRef<HTMLDivElement>(null);
    const composerRef = useRef<AiComposerRef>(null);
    const emptyStateHostRef = useRef<HTMLDivElement>(null);
    const autoScrollPinnedRef = useRef(true);
    const [emptyStatePanelLayout, setEmptyStatePanelLayout] = useState<'stacked' | 'split'>(
      'stacked'
    );
    const [showJumpToLatest, setShowJumpToLatest] = useState(false);
    const { restoreToCheckpoint } = useHistory();

    useImperativeHandle(ref, () => ({
      focusPrompt: () => {
        composerRef.current?.focus();
      },
    }));

    const scrollTranscriptToBottom = () => {
      if (!responseRef.current) return;

      responseRef.current.scrollTop = responseRef.current.scrollHeight;
      autoScrollPinnedRef.current = true;
      setShowJumpToLatest(false);
    };

    const handleTranscriptScroll = () => {
      if (!responseRef.current) return;

      const isPinned = isTranscriptNearBottom(responseRef.current);
      autoScrollPinnedRef.current = isPinned;
      setShowJumpToLatest(!isPinned);
    };

    useEffect(() => {
      const node = responseRef.current;
      if (!node) return;

      if (autoScrollPinnedRef.current) {
        node.scrollTop = node.scrollHeight;
        autoScrollPinnedRef.current = true;
        setShowJumpToLatest(false);
        return;
      }

      setShowJumpToLatest(true);
    }, [messages, streamingResponse, currentToolCalls]);

    useEffect(() => {
      if (messages.length > 0 || streamingResponse || currentToolCalls.length > 0) {
        return;
      }

      autoScrollPinnedRef.current = true;
      setShowJumpToLatest(false);
    }, [messages.length, streamingResponse, currentToolCalls.length]);

    useEffect(() => {
      if (import.meta.env?.DEV) {
        console.log('[AiPromptPanel] Messages updated. Count:', messages.length);
      }
    }, [messages]);

    useEffect(() => {
      analytics.track('ai panel opened', {
        source_surface: 'ai_panel',
        has_messages: messages.length > 0,
      });
      // Only fire once per panel mount.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
      if (typeof ResizeObserver === 'undefined') {
        setEmptyStatePanelLayout('stacked');
        return;
      }

      const node = emptyStateHostRef.current;
      if (!node) return;

      const updateLayout = (width: number, height: number) => {
        setEmptyStatePanelLayout(
          width >= 760 && width / Math.max(height, 1) >= 1.45 ? 'split' : 'stacked'
        );
      };

      const rect = node.getBoundingClientRect();
      updateLayout(rect.width, rect.height);

      const observer = new ResizeObserver((entries) => {
        const entry = entries[0];
        if (!entry) return;
        updateLayout(entry.contentRect.width, entry.contentRect.height);
      });

      observer.observe(node);
      return () => observer.disconnect();
    }, []);

    const handleRestoreCheckpoint = async (checkpointId: string, messageId: string) => {
      try {
        const messageIndex = messages.findIndex((message) => message.id === messageId);
        const hasLaterMessages = messageIndex !== -1 && messageIndex < messages.length - 1;

        if (hasLaterMessages) {
          const shouldProceed = await getPlatform().confirm(
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

        const checkpoint = await restoreToCheckpoint(checkpointId);
        if (!checkpoint) {
          throw new Error('Checkpoint could not be restored.');
        }

        if (messageIndex !== -1 && onRestoreCheckpoint) {
          const truncatedMessages = messages.slice(0, messageIndex);
          onRestoreCheckpoint(checkpointId, truncatedMessages);
        }

        notifySuccess('Restored checkpoint', {
          toastId: 'restore-checkpoint-success',
        });
      } catch (error) {
        notifyError({
          operation: 'restore-checkpoint',
          error,
          fallbackMessage: 'Failed to restore checkpoint',
          toastId: 'restore-checkpoint-error',
          logLabel: '[AiPromptPanel] Failed to restore checkpoint',
        });
      }
    };

    if (!hasApiKey) {
      const isDesktop = getPlatform().capabilities.hasFileSystem;
      return (
        <div
          ref={emptyStateHostRef}
          className={
            isDesktop
              ? 'h-full overflow-y-auto flex items-start justify-center px-6 py-6'
              : 'h-full overflow-y-auto flex items-center justify-center px-6'
          }
          style={{ backgroundColor: 'var(--bg-primary)' }}
        >
          {isDesktop ? (
            <AiAccessEmptyState
              onOpenSettings={onOpenSettings}
              variant="panel"
              panelLayout={emptyStatePanelLayout}
            />
          ) : (
            <div className="text-center max-w-xs">
              <div className="text-sm mb-3" style={{ color: 'var(--text-secondary)' }}>
                Add an API key to get started
              </div>
              <Button type="button" variant="primary" onClick={() => onOpenSettings?.()}>
                Open Settings
              </Button>
            </div>
          )}
        </div>
      );
    }

    return (
      <div
        data-testid="ai-prompt-panel"
        className="relative h-full flex flex-col ph-no-capture"
        style={{ backgroundColor: 'var(--bg-primary)' }}
      >
        {onNewConversation && (
          <Button
            size="sm"
            variant="secondary"
            onClick={onNewConversation}
            title="Start new conversation"
            data-testid="ai-new-conversation-button"
            disabled={isStreaming}
            className="absolute top-3 right-3 z-10 shadow-sm"
          >
            + New
          </Button>
        )}

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
            data-testid="ai-transcript"
            className="flex-1 overflow-y-auto px-4 py-3 space-y-3 ph-no-capture"
            onScroll={handleTranscriptScroll}
            style={{
              backgroundColor: 'var(--bg-secondary)',
              borderBottom: '1px solid var(--border-primary)',
              paddingTop: onNewConversation ? '3rem' : undefined,
            }}
          >
            {messages.map((message) => {
              if (message.type === 'user') {
                const userText = getUserMessageText(message);
                const imageParts = message.parts.filter((part) => part.type === 'image');

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
                        {userText ? (
                          <div className="text-sm whitespace-pre-wrap font-mono">{userText}</div>
                        ) : null}
                        {imageParts.length > 0 && (
                          <ChatImageGrid
                            className={userText ? 'mt-2' : ''}
                            images={imageParts
                              .map((part) => {
                                const att = attachments[part.attachmentId];
                                return {
                                  src: att?.previewUrl ?? '',
                                  fullSrc:
                                    att?.normalizedData && att.normalizedMimeType
                                      ? `data:${att.normalizedMimeType};base64,${att.normalizedData}`
                                      : undefined,
                                  width: att?.width,
                                  height: att?.height,
                                  filename: part.filename,
                                };
                              })
                              .filter((img) => Boolean(img.src))}
                          />
                        )}
                      </div>
                    </div>
                    {message.checkpointId && (
                      <div className="flex justify-end">
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => handleRestoreCheckpoint(message.checkpointId!, message.id)}
                          title="Restore code to before this turn"
                        >
                          ↶ Restore to before this turn
                        </Button>
                      </div>
                    )}
                  </div>
                );
              }

              if (message.type === 'assistant') {
                const stateLabel = getAssistantStateLabel(message);
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
                      <div className="text-sm">
                        <MarkdownMessage content={message.content} />
                      </div>
                      {stateLabel && (
                        <div className="mt-2 text-xs" style={{ color: 'var(--text-tertiary)' }}>
                          {stateLabel}
                        </div>
                      )}
                    </div>
                  </div>
                );
              }

              if (message.type === 'tool-call') {
                const toolMessage = message as ToolCallMessage;

                return (
                  <div key={message.id} className="flex gap-2 justify-start">
                    <ToolCallCard
                      toolName={toolMessage.toolName}
                      state={toolMessage.state}
                      args={toolMessage.args}
                      result={toolMessage.result}
                      errorText={toolMessage.errorText}
                    />
                  </div>
                );
              }

              return null;
            })}

            {currentToolCalls.length > 0 && (
              <div className="flex gap-2 justify-start">
                <div className="space-y-2">
                  {currentToolCalls.map((tool) => (
                    <ToolCallCard
                      key={tool.toolCallId}
                      toolName={tool.name}
                      state={tool.state}
                      args={tool.args}
                      result={tool.result}
                      errorText={tool.errorText}
                    />
                  ))}
                </div>
              </div>
            )}

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
                  <div className="text-sm">
                    <MarkdownMessage content={streamingResponse} />
                  </div>
                </div>
              </div>
            )}

            {isStreaming &&
              !streamingResponse &&
              currentToolCalls.filter((toolCall) => toolCall.state === 'pending').length === 0 && (
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
                        {[0, 1, 2].map((idx) => (
                          <div
                            key={idx}
                            className="w-2 h-2 rounded-full animate-pulse"
                            style={{
                              backgroundColor: 'var(--accent-primary)',
                              animationDelay: `${idx * 200}ms`,
                              animationDuration: '1.4s',
                            }}
                          />
                        ))}
                      </div>
                      <span className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
                        Thinking...
                      </span>
                    </div>
                  </div>
                </div>
              )}

            {showJumpToLatest && (
              <div className="sticky bottom-2 z-10 flex justify-end pr-1 pointer-events-none">
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  className="pointer-events-auto shadow-sm"
                  onClick={scrollTranscriptToBottom}
                  title="Jump to the latest response"
                  data-testid="ai-scroll-to-latest"
                >
                  Jump to latest
                </Button>
              </div>
            )}
          </div>
        )}

        <div className="p-2">
          <AiComposer
            ref={composerRef}
            draft={draft}
            attachments={attachments}
            disabled={isStreaming}
            isProcessingAttachments={isProcessingAttachments}
            canSubmit={canSubmitDraft}
            blockedMessage={draftVisionBlockMessage}
            warningMessage={draftVisionWarningMessage}
            errors={draftErrors}
            placeholder="Describe the changes you want to make..."
            rows={1}
            maxRows={4}
            variant="panel"
            submitLabel="Send"
            submitTitle="Send (Enter). Shift+Enter adds a newline."
            trailingControls={
              <ModelSelector
                currentModel={currentModel}
                availableProviders={availableProviders}
                onChange={(model) => onModelChange?.(model, 'ai_panel')}
                disabled={isStreaming}
                compact
              />
            }
            onTextChange={onTextChange}
            onFilesSelected={onFilesSelected}
            onRemoveAttachment={onRemoveAttachment}
            onSubmit={onSubmit}
            onCancel={onCancel}
          />
        </div>
      </div>
    );
  }
);

AiPromptPanel.displayName = 'AiPromptPanel';
