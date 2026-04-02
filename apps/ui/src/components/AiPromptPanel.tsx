import { useRef, useEffect, forwardRef, useImperativeHandle } from 'react';
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
    const { restoreToCheckpoint } = useHistory();

    useImperativeHandle(ref, () => ({
      focusPrompt: () => {
        composerRef.current?.focus();
      },
    }));

    useEffect(() => {
      if (responseRef.current) {
        responseRef.current.scrollTop = responseRef.current.scrollHeight;
      }
    }, [messages, streamingResponse, currentToolCalls]);

    useEffect(() => {
      if (import.meta.env.DEV) {
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
          className="h-full flex items-center justify-center px-6"
          style={{ backgroundColor: 'var(--bg-primary)' }}
        >
          {isDesktop ? (
            <AiAccessEmptyState onOpenSettings={onOpenSettings} variant="panel" />
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
                const toolStateMeta = getToolStateMeta(toolMessage.state);
                const imageDataUrl =
                  toolMessage.toolName === 'get_preview_screenshot'
                    ? getImageDataUrlFromResult(toolMessage.result)
                    : null;

                return (
                  <div key={message.id} className="flex gap-2 justify-start">
                    <div
                      className="rounded-lg px-3 py-2 border"
                      style={{
                        backgroundColor: 'var(--bg-primary)',
                        borderColor: toolStateMeta.borderColor,
                      }}
                    >
                      <div className="flex items-center gap-2 text-sm">
                        {toolStateMeta.icon}
                        <span className="font-semibold" style={{ color: toolStateMeta.color }}>
                          {message.toolName}
                        </span>
                        <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                          {toolStateMeta.label}
                        </span>
                      </div>
                      {message.errorText && (
                        <div className="mt-2 text-xs" style={{ color: 'var(--color-error)' }}>
                          {message.errorText}
                        </div>
                      )}
                      {imageDataUrl && (
                        <div className="mt-2">
                          <ChatImage
                            src={imageDataUrl}
                            alt="Preview screenshot"
                            filename="preview.png"
                          />
                        </div>
                      )}
                    </div>
                  </div>
                );
              }

              return null;
            })}

            {currentToolCalls.length > 0 && (
              <div className="flex gap-2 justify-start">
                <div className="space-y-2">
                  {currentToolCalls.map((tool) => {
                    const toolStateMeta = getToolStateMeta(tool.state);
                    const imageDataUrl =
                      tool.name === 'get_preview_screenshot'
                        ? getImageDataUrlFromResult(tool.result)
                        : null;

                    return (
                      <div
                        key={tool.toolCallId}
                        className="rounded-lg px-3 py-2 border"
                        style={{
                          backgroundColor: 'var(--bg-primary)',
                          borderColor: toolStateMeta.borderColor,
                        }}
                      >
                        <div className="flex items-center gap-2 text-sm">
                          {toolStateMeta.icon}
                          <span className="font-semibold" style={{ color: toolStateMeta.color }}>
                            {tool.name}
                          </span>
                          <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                            {toolStateMeta.label}
                          </span>
                        </div>
                        {tool.errorText && (
                          <div className="mt-2 text-xs" style={{ color: 'var(--color-error)' }}>
                            {tool.errorText}
                          </div>
                        )}
                        {imageDataUrl && (
                          <div className="mt-2">
                            <ChatImage
                              src={imageDataUrl}
                              alt="Preview screenshot"
                              filename="preview.png"
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
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
