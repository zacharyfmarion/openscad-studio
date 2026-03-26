import { useEffect, useMemo, useRef, useState } from 'react';
import { TbCheck, TbCopy, TbLink, TbX } from 'react-icons/tb';
import { useAnalytics } from '../analytics/runtime';
import type { RenderKind } from '../hooks/useOpenScad';
import { captureOffscreen } from '../services/offscreenRenderer';
import { buildShareUrl } from '../services/shareRouting';
import {
  createShare,
  getShareApiBase,
  ShareRequestError,
  uploadThumbnail,
} from '../services/shareService';
import type { ShareMode } from '../types/share';
import { Button, IconButton, Input, Label, SegmentedControl, Text } from './ui';

interface ShareDialogProps {
  isOpen: boolean;
  onClose: () => void;
  source: string;
  tabName: string;
  forkedFrom?: string | null;
  capturePreview: () => Promise<string | null>;
  stlBlobUrl: string | null;
  previewKind: RenderKind | null;
}

const SHARE_MODE_OPTIONS: Array<{
  value: ShareMode;
  label: string;
  title: string;
  testId: string;
}> = [
  {
    value: 'default',
    label: 'Editor First',
    title: 'Open the shared design in the full editor by default',
    testId: 'share-mode-default',
  },
  {
    value: 'ai-first',
    label: 'AI First',
    title: 'Open the shared design with AI front and center',
    testId: 'share-mode-ai-first',
  },
  {
    value: 'customizer-first',
    label: 'Customizer First',
    title: 'Open the shared design in the customizer by default',
    testId: 'share-mode-customizer-first',
  },
];

function getDefaultShareTitle(tabName: string): string {
  const trimmed = tabName.trim();
  if (!trimmed) {
    return 'Untitled Design';
  }

  return trimmed.replace(/\.scad$/i, '') || 'Untitled Design';
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  return `${(bytes / 1024).toFixed(1)} KB`;
}

function mapCreateShareError(error: unknown): string {
  if (error instanceof ShareRequestError) {
    if (error.status === 413) {
      return 'Design is too large (50KB max).';
    }
    if (error.status === 429) {
      return 'Too many shares. Try again in a few minutes.';
    }
    return error.message || 'Something went wrong. Try again.';
  }

  return "Couldn't create link. Check your connection.";
}

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const response = await fetch(dataUrl);
  return response.blob();
}

export function ShareDialog({
  isOpen,
  onClose,
  source,
  tabName,
  forkedFrom = null,
  capturePreview,
  stlBlobUrl,
  previewKind,
}: ShareDialogProps) {
  const analytics = useAnalytics();
  const [title, setTitle] = useState(getDefaultShareTitle(tabName));
  const [shareMode, setShareMode] = useState<ShareMode>('customizer-first');
  const [isSharing, setIsSharing] = useState(false);
  const [error, setError] = useState<string>('');
  const [shareId, setShareId] = useState<string | null>(null);
  const [baseShareUrl, setBaseShareUrl] = useState<string | null>(null);
  const [includeAttribution, setIncludeAttribution] = useState(Boolean(forkedFrom));
  const [copied, setCopied] = useState(false);
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const linkInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    analytics.track('share dialog opened');
    setTitle(getDefaultShareTitle(tabName));
    setShareMode('customizer-first');
    setIsSharing(false);
    setError('');
    setShareId(null);
    setBaseShareUrl(null);
    setIncludeAttribution(Boolean(forkedFrom));
    setCopied(false);
    if (copyTimeoutRef.current) {
      clearTimeout(copyTimeoutRef.current);
    }
  }, [analytics, forkedFrom, isOpen, tabName]);

  const codeSize = useMemo(() => new TextEncoder().encode(source).length, [source]);
  const shareLimitBytes = 51_200;
  const canShare = source.trim().length > 0 && codeSize <= shareLimitBytes && !isSharing;
  const currentShareUrl =
    shareId && baseShareUrl ? buildShareUrl(baseShareUrl, shareId, shareMode) : '';

  if (!isOpen) {
    return null;
  }

  const handleUploadThumbnail = async (nextShareId: string, thumbnailUploadToken: string) => {
    try {
      let previewBlob: Blob | null = null;
      if (previewKind === 'mesh' && stlBlobUrl) {
        const dataUrl = await captureOffscreen(stlBlobUrl, {
          view: 'isometric',
          width: 1200,
          height: 630,
        });
        previewBlob = await dataUrlToBlob(dataUrl);
      }

      if (!previewBlob) {
        const previewDataUrl = await capturePreview();
        if (!previewDataUrl) {
          return;
        }
        previewBlob = await dataUrlToBlob(previewDataUrl);
      }

      await uploadThumbnail(nextShareId, previewBlob, thumbnailUploadToken);
    } catch (uploadError) {
      console.warn('[share] Thumbnail upload failed:', uploadError);
    }
  };

  const handleCreateShare = async () => {
    setError('');
    setIsSharing(true);

    try {
      const result = await createShare({
        code: source,
        title,
        forkedFrom: includeAttribution ? forkedFrom : null,
      });

      setShareId(result.id);
      setBaseShareUrl(new URL(result.url).origin || getShareApiBase());
      analytics.track('design shared', {
        has_forked_from: Boolean(includeAttribution && forkedFrom),
        code_size_bytes: codeSize,
        share_mode: shareMode,
      });
      void handleUploadThumbnail(result.id, result.thumbnailUploadToken);
    } catch (shareError) {
      setError(mapCreateShareError(shareError));
    } finally {
      setIsSharing(false);
    }
  };

  const handleCopyLink = async () => {
    if (!currentShareUrl) {
      return;
    }

    try {
      await navigator.clipboard.writeText(currentShareUrl);
      analytics.track('share link copied', {
        mode: shareMode,
      });
      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current);
      }
      setCopied(true);
      copyTimeoutRef.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      linkInputRef.current?.focus();
      linkInputRef.current?.select();
      setError('Copy the link above');
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <div
        data-testid="share-dialog"
        className="mx-4 flex w-full max-w-lg flex-col overflow-hidden rounded-xl shadow-2xl"
        style={{
          backgroundColor: 'var(--bg-secondary)',
          border: '1px solid var(--border-primary)',
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <div
          className="flex items-center justify-between"
          style={{
            borderBottom: '1px solid var(--border-primary)',
            padding: `var(--space-4) var(--space-dialog-padding-x)`,
            gap: 'var(--space-control-gap)',
          }}
        >
          <div className="flex items-center gap-2">
            <TbLink size={16} style={{ color: 'var(--accent-primary)' }} />
            <Text variant="section-heading" weight="medium" color="tertiary">
              Share Design
            </Text>
          </div>
          <IconButton size="sm" onClick={onClose} title="Close">
            <TbX size={16} />
          </IconButton>
        </div>

        <div
          className="flex flex-col"
          style={{
            gap: 'var(--space-section-gap)',
            padding: `var(--space-dialog-padding-y) var(--space-dialog-padding-x)`,
          }}
        >
          <div className="flex flex-col" style={{ gap: 'var(--space-label-gap)' }}>
            <Label htmlFor="share-title" className="mb-0">
              Title
            </Label>
            <Input
              id="share-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              disabled={isSharing}
            />
          </div>

          {codeSize > shareLimitBytes ? (
            <div
              className="rounded-lg px-4 py-3 text-sm"
              style={{
                backgroundColor: 'rgba(220, 50, 47, 0.1)',
                border: '1px solid rgba(220, 50, 47, 0.3)',
                color: 'var(--color-error)',
              }}
            >
              This design is too large to share right now. Reduce it below{' '}
              {formatBytes(shareLimitBytes)}.
            </div>
          ) : null}

          {forkedFrom && (
            <div
              className="rounded-lg px-3 py-3 text-sm"
              style={{
                backgroundColor: 'var(--bg-elevated)',
                border: '1px solid var(--border-primary)',
                color: 'var(--text-secondary)',
              }}
            >
              <label
                className="flex items-center justify-between"
                style={{ gap: 'var(--space-control-gap)' }}
              >
                <span>Attribute this share to the design you remixed</span>
                <input
                  type="checkbox"
                  checked={includeAttribution}
                  onChange={(event) => setIncludeAttribution(event.target.checked)}
                />
              </label>
            </div>
          )}

          {error && (
            <div
              className="rounded-lg px-4 py-3 text-sm"
              style={{
                backgroundColor: 'rgba(220, 50, 47, 0.1)',
                border: '1px solid rgba(220, 50, 47, 0.3)',
                color: 'var(--color-error)',
              }}
            >
              {error}
            </div>
          )}

          {!shareId ? (
            <div className="flex flex-col" style={{ gap: 'var(--space-4)' }}>
              <Text variant="caption" style={{ color: 'var(--text-secondary)' }}>
                Anyone with this link will be able to view the design. They will open their own
                editable copy, so they cannot change your original.
              </Text>
              <Button
                data-testid="share-create-button"
                variant="primary"
                size="lg"
                onClick={handleCreateShare}
                disabled={!canShare}
                className="w-full"
              >
                {isSharing ? 'Creating link...' : 'Create Share Link'}
              </Button>
            </div>
          ) : (
            <div className="flex flex-col" style={{ gap: 'var(--space-section-gap)' }}>
              <div className="flex flex-col" style={{ gap: 'var(--space-label-gap)' }}>
                <Label className="mb-0">Default View</Label>
                <SegmentedControl
                  aria-label="Default shared design view"
                  options={SHARE_MODE_OPTIONS}
                  value={shareMode}
                  onChange={(next) => {
                    analytics.track('share mode changed', { mode: next, previous_mode: shareMode });
                    setShareMode(next);
                  }}
                />
              </div>

              <div className="flex flex-col" style={{ gap: 'var(--space-4)' }}>
                <div className="flex flex-col" style={{ gap: 'var(--space-label-gap)' }}>
                  <Label htmlFor="share-link" className="mb-0">
                    Link
                  </Label>
                  <div className="flex items-center" style={{ gap: 'var(--space-control-gap)' }}>
                    <Input
                      id="share-link"
                      ref={linkInputRef}
                      readOnly
                      value={currentShareUrl}
                      data-testid="share-link-input"
                    />
                    <IconButton
                      data-testid="share-copy-button"
                      size="sm"
                      onClick={handleCopyLink}
                      title={copied ? 'Copied!' : 'Copy link'}
                      style={
                        copied
                          ? { color: 'var(--accent-primary)', transition: 'color 0.3s' }
                          : { transition: 'color 0.3s' }
                      }
                    >
                      <span
                        key={copied ? 'check' : 'copy'}
                        style={{
                          display: 'flex',
                          animation: 'scaleIn 0.15s cubic-bezier(0.34, 1.56, 0.64, 1)',
                        }}
                      >
                        {copied ? <TbCheck size={16} /> : <TbCopy size={16} />}
                      </span>
                    </IconButton>
                  </div>
                </div>
                <Text variant="caption" style={{ color: 'var(--text-secondary)' }}>
                  Anyone with this link will be able to view the design. They will open their own
                  editable copy, so they cannot change your original.
                </Text>
              </div>
            </div>
          )}
        </div>

        <div
          className="flex items-center justify-end"
          style={{
            borderTop: '1px solid var(--border-primary)',
            gap: 'var(--space-dialog-footer-gap)',
            padding: `var(--space-3) var(--space-dialog-padding-x)`,
          }}
        >
          <Button variant="ghost" onClick={onClose} disabled={isSharing}>
            {shareId ? 'Done' : 'Cancel'}
          </Button>
        </div>
      </div>
    </div>
  );
}
