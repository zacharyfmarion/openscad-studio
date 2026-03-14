import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { TbPaperclip, TbX } from 'react-icons/tb';
import { Button, IconButton } from './ui';
import type { ModelSelectionSurface } from '../analytics/runtime';
import type { AiDraft, AttachmentStore } from '../types/aiChat';

interface AiComposerProps {
  draft: AiDraft;
  attachments: AttachmentStore;
  disabled?: boolean;
  isProcessingAttachments: boolean;
  canSubmit: boolean;
  blockedMessage?: string | null;
  warningMessage?: string | null;
  errors?: string[];
  placeholder: string;
  rows?: number;
  maxRows?: number;
  variant?: 'panel' | 'welcome';
  submitLabel?: string;
  submitTitle?: string;
  helperText?: ReactNode;
  trailingControls?: ReactNode;
  onTextChange: (text: string) => void;
  onFilesSelected: (files: File[], sourceSurface?: ModelSelectionSurface) => void;
  onRemoveAttachment: (attachmentId: string, sourceSurface?: ModelSelectionSurface) => void;
  onSubmit: () => void;
  onCancel?: () => void;
}

export interface AiComposerRef {
  focus: () => void;
}

function hasFilePayload(event: React.DragEvent | DragEvent) {
  return Array.from(event.dataTransfer?.types ?? []).includes('Files');
}

function getComposerSourceSurface(variant: 'panel' | 'welcome'): ModelSelectionSurface {
  return variant === 'welcome' ? 'welcome' : 'ai_panel';
}

export const AiComposer = forwardRef<AiComposerRef, AiComposerProps>(
  (
    {
      draft,
      attachments,
      disabled = false,
      isProcessingAttachments,
      canSubmit,
      blockedMessage,
      warningMessage,
      errors = [],
      placeholder,
      rows = 2,
      maxRows = rows,
      variant = 'panel',
      submitLabel = 'Send',
      submitTitle,
      helperText,
      trailingControls,
      onTextChange,
      onFilesSelected,
      onRemoveAttachment,
      onSubmit,
      onCancel,
    },
    ref
  ) => {
    const [isDragActive, setIsDragActive] = useState(false);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const dragDepthRef = useRef(0);

    useImperativeHandle(ref, () => ({
      focus: () => {
        textareaRef.current?.focus();
      },
    }));

    useEffect(() => {
      if (!disabled) {
        textareaRef.current?.focus();
      }
    }, [disabled]);

    useLayoutEffect(() => {
      if (variant !== 'panel' || !textareaRef.current) return;

      const textarea = textareaRef.current;
      textarea.style.height = '0px';

      const computedStyle = window.getComputedStyle(textarea);
      const lineHeight = Number.parseFloat(computedStyle.lineHeight) || 20;
      const paddingTop = Number.parseFloat(computedStyle.paddingTop) || 0;
      const paddingBottom = Number.parseFloat(computedStyle.paddingBottom) || 0;
      const borderTop = Number.parseFloat(computedStyle.borderTopWidth) || 0;
      const borderBottom = Number.parseFloat(computedStyle.borderBottomWidth) || 0;
      const minHeight = lineHeight * rows + paddingTop + paddingBottom + borderTop + borderBottom;
      const maxHeight =
        lineHeight * maxRows + paddingTop + paddingBottom + borderTop + borderBottom;
      const nextHeight = Math.min(Math.max(textarea.scrollHeight, minHeight), maxHeight);

      textarea.style.height = `${nextHeight}px`;
      textarea.style.overflowY = textarea.scrollHeight > maxHeight ? 'auto' : 'hidden';
    }, [draft.text, maxRows, rows, variant]);

    const draftAttachments = useMemo(
      () =>
        draft.attachmentIds
          .map((id) => attachments[id])
          .filter((attachment): attachment is NonNullable<(typeof attachments)[string]> =>
            Boolean(attachment)
          ),
      [attachments, draft.attachmentIds]
    );

    const submitDisabled =
      disabled || isProcessingAttachments || !canSubmit || Boolean(blockedMessage);

    const handleFiles = (files: FileList | File[] | null) => {
      if (disabled || !files?.length) return;
      onFilesSelected(Array.from(files), getComposerSourceSurface(variant));
    };

    const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        if (!submitDisabled) {
          onSubmit();
        }
      }

      if (event.key === 'Escape' && onCancel && disabled) {
        event.preventDefault();
        onCancel();
      }
    };

    const resetDragState = () => {
      dragDepthRef.current = 0;
      setIsDragActive(false);
    };

    const handleDragEnter = (event: React.DragEvent<HTMLDivElement>) => {
      if (disabled || !hasFilePayload(event)) return;
      event.preventDefault();
      dragDepthRef.current += 1;
      setIsDragActive(true);
    };

    const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
      if (disabled || !hasFilePayload(event)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';

      if (!isDragActive) {
        setIsDragActive(true);
      }
    };

    const handleDragLeave = (event: React.DragEvent<HTMLDivElement>) => {
      if (disabled || !hasFilePayload(event)) return;

      dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
      if (dragDepthRef.current === 0) {
        setIsDragActive(false);
      }
    };

    const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
      if (disabled || !hasFilePayload(event)) return;
      event.preventDefault();
      resetDragState();
      handleFiles(event.dataTransfer.files);
    };

    const rootBorderColor = isDragActive
      ? 'var(--accent-primary)'
      : variant === 'welcome'
        ? 'var(--border-secondary)'
        : 'var(--border-primary)';

    return (
      <div
        data-testid="ai-composer"
        className="rounded-xl border transition-colors ph-no-capture"
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        style={{
          borderColor: rootBorderColor,
          backgroundColor: variant === 'welcome' ? 'var(--bg-elevated)' : 'var(--bg-primary)',
          boxShadow: isDragActive ? '0 0 0 1px var(--accent-primary)' : 'none',
        }}
      >
        <div className={variant === 'welcome' ? 'p-4' : 'p-2'}>
          <textarea
            ref={textareaRef}
            value={draft.text}
            onChange={(event) => onTextChange(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            className="w-full resize-none focus:outline-none text-sm"
            style={{
              backgroundColor: 'transparent',
              color: 'var(--text-primary)',
              minHeight: variant === 'welcome' ? (rows >= 4 ? '84px' : undefined) : undefined,
              fontFamily: 'inherit',
              padding: variant === 'welcome' ? undefined : '0.25rem 0.25rem 0.125rem 0.25rem',
              lineHeight: variant === 'welcome' ? undefined : '1.45',
            }}
            rows={rows}
            disabled={disabled}
            title={variant === 'panel' ? 'Enter submits. Shift+Enter adds a newline.' : undefined}
          />

          {draftAttachments.length > 0 && (
            <div
              className={
                variant === 'welcome'
                  ? 'mt-3 flex flex-wrap gap-2'
                  : 'mt-2 flex gap-2 overflow-x-auto pb-1'
              }
            >
              {draftAttachments.map((attachment) => (
                <div
                  key={attachment.id}
                  className="group relative rounded-md border p-1.5"
                  style={{
                    width: variant === 'welcome' ? '112px' : '84px',
                    flex: variant === 'welcome' ? undefined : '0 0 auto',
                    backgroundColor: 'var(--bg-secondary)',
                    borderColor:
                      attachment.status === 'error'
                        ? 'var(--color-error)'
                        : attachment.status === 'pending'
                          ? 'var(--color-warning)'
                          : 'var(--border-secondary)',
                  }}
                >
                  <button
                    type="button"
                    onClick={() =>
                      onRemoveAttachment(attachment.id, getComposerSourceSurface(variant))
                    }
                    className="absolute right-1 top-1 z-10 flex h-5 w-5 items-center justify-center rounded-full opacity-0 transition-opacity group-hover:opacity-100"
                    style={{
                      color: 'var(--text-primary)',
                      backgroundColor: 'rgba(0, 0, 0, 0.55)',
                    }}
                    title={`Remove ${attachment.filename}`}
                    aria-label={`Remove ${attachment.filename}`}
                  >
                    <TbX size={12} />
                  </button>

                  {attachment.previewUrl ? (
                    <img
                      src={attachment.previewUrl}
                      alt={attachment.filename}
                      className="w-full rounded object-cover"
                      style={{
                        height: variant === 'welcome' ? '60px' : '52px',
                        backgroundColor: 'var(--bg-tertiary)',
                      }}
                    />
                  ) : (
                    <div
                      className="w-full rounded flex items-center justify-center text-xs"
                      style={{
                        height: variant === 'welcome' ? '60px' : '52px',
                        backgroundColor: 'var(--bg-tertiary)',
                        color: 'var(--text-tertiary)',
                      }}
                    >
                      No preview
                    </div>
                  )}

                  <div className="mt-1.5 flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div
                        className="text-[11px] font-medium truncate"
                        style={{ color: 'var(--text-primary)' }}
                        title={attachment.filename}
                      >
                        {attachment.filename}
                      </div>
                      <div
                        className="text-[10px] truncate"
                        style={{ color: 'var(--text-tertiary)' }}
                      >
                        {attachment.status === 'ready'
                          ? `${Math.round(attachment.sizeBytes / 1024)} KB`
                          : attachment.status === 'pending'
                            ? 'Processing...'
                            : 'Not attached'}
                      </div>
                    </div>
                  </div>

                  {attachment.errorMessage && (
                    <div className="mt-1 text-[10px]" style={{ color: 'var(--color-error)' }}>
                      {attachment.errorMessage}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {(errors.length > 0 || blockedMessage || warningMessage || isDragActive) && (
            <div className={variant === 'welcome' ? 'mt-3 space-y-1' : 'mt-1.5 space-y-1'}>
              {isDragActive && (
                <div className="text-xs" style={{ color: 'var(--accent-primary)' }}>
                  Drop PNG, JPEG, or WebP images to attach them.
                </div>
              )}
              {blockedMessage && (
                <div className="text-xs" style={{ color: 'var(--color-error)' }}>
                  {blockedMessage}
                </div>
              )}
              {warningMessage && !blockedMessage && (
                <div className="text-xs" style={{ color: 'var(--color-warning)' }}>
                  {warningMessage}
                </div>
              )}
              {errors.map((error) => (
                <div key={error} className="text-xs" style={{ color: 'var(--color-error)' }}>
                  {error}
                </div>
              ))}
            </div>
          )}

          <div
            className="mt-2 flex items-center justify-between gap-2"
            style={{
              flexWrap: variant === 'welcome' ? 'nowrap' : 'wrap',
            }}
          >
            <div className="flex min-w-0 items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                multiple
                className="hidden"
                onChange={(event) => {
                  handleFiles(event.target.files);
                  event.currentTarget.value = '';
                }}
              />
              <IconButton
                type="button"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={disabled}
                aria-label="Upload images"
                title="Upload images"
              >
                <TbPaperclip size={14} />
              </IconButton>
              <div className="text-xs whitespace-nowrap" style={{ color: 'var(--text-tertiary)' }}>
                {variant === 'welcome' ? 'Drop up to 4 images' : 'Attach images'}
              </div>
            </div>

            <div
              className="flex items-center gap-2"
              style={{
                marginLeft: variant === 'welcome' ? undefined : 'auto',
                flexWrap: variant === 'welcome' ? 'nowrap' : 'wrap',
                justifyContent: 'flex-end',
              }}
            >
              {helperText ? (
                <div
                  className="text-xs text-right"
                  style={{
                    color: 'var(--text-tertiary)',
                    display: variant === 'welcome' ? 'block' : 'none',
                  }}
                >
                  {helperText}
                </div>
              ) : null}
              {trailingControls}
              {disabled && onCancel ? (
                <Button
                  variant="danger"
                  size={variant === 'panel' ? 'sm' : 'md'}
                  onClick={() => onCancel()}
                  data-testid="ai-cancel-button"
                  style={variant === 'panel' ? { height: '32px', minWidth: '88px' } : undefined}
                >
                  Cancel
                </Button>
              ) : (
                <Button
                  variant="primary"
                  size={variant === 'panel' ? 'sm' : 'md'}
                  onClick={() => onSubmit()}
                  disabled={submitDisabled}
                  title={submitTitle}
                  data-testid="ai-submit-button"
                  style={variant === 'panel' ? { height: '32px', minWidth: '88px' } : undefined}
                >
                  {submitLabel}
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }
);

AiComposer.displayName = 'AiComposer';
