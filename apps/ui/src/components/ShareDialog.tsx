import { useEffect, useMemo, useRef, useState } from 'react';
import { TbCheck, TbCopy, TbExternalLink, TbLink, TbX } from 'react-icons/tb';
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
import { Button, IconButton, Input, Label, Text } from './ui';

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
  const [shareMode, setShareMode] = useState<ShareMode>('customizer');
  const [isSharing, setIsSharing] = useState(false);
  const [error, setError] = useState<string>('');
  const [shareId, setShareId] = useState<string | null>(null);
  const [baseShareUrl, setBaseShareUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [includeAttribution, setIncludeAttribution] = useState(Boolean(forkedFrom));
  const linkInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setTitle(getDefaultShareTitle(tabName));
    setShareMode('customizer');
    setIsSharing(false);
    setError('');
    setShareId(null);
    setBaseShareUrl(null);
    setCopied(false);
    setIncludeAttribution(Boolean(forkedFrom));
  }, [forkedFrom, isOpen, tabName]);

  const codeSize = useMemo(() => new TextEncoder().encode(source).length, [source]);
  const canShare = source.trim().length > 0 && codeSize <= 51_200 && !isSharing;
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
    setCopied(false);

    try {
      const result = await createShare({
        code: source,
        title,
        forkedFrom: includeAttribution ? forkedFrom : null,
      });

      setShareId(result.id);
      setBaseShareUrl(new URL(result.url).origin || getShareApiBase());
      analytics.track('design_shared', {
        has_forked_from: Boolean(includeAttribution && forkedFrom),
        code_size_bytes: codeSize,
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
      setCopied(true);
      analytics.track('share_link_copied', {
        mode: shareMode,
      });
    } catch {
      linkInputRef.current?.focus();
      linkInputRef.current?.select();
      setCopied(false);
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
          className="flex items-center justify-between px-6 py-4"
          style={{ borderBottom: '1px solid var(--border-primary)' }}
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

        <div className="space-y-4 px-6 py-5">
          <div>
            <Label htmlFor="share-title">Title</Label>
            <Input
              id="share-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              disabled={isSharing}
            />
          </div>

          <div
            className="flex items-center justify-between rounded-lg px-3 py-2 text-sm"
            style={{
              backgroundColor: 'var(--bg-elevated)',
              border: '1px solid var(--border-primary)',
              color: codeSize > 51_200 ? 'var(--color-error)' : 'var(--text-secondary)',
            }}
          >
            <span>Size</span>
            <span>
              {formatBytes(codeSize)} / {formatBytes(51_200)} max
            </span>
          </div>

          <Text variant="caption" style={{ color: 'var(--text-secondary)' }}>
            Anyone with this link will be able to view the design. They will open their own editable
            copy, so they cannot change your original.
          </Text>

          {forkedFrom && (
            <div
              className="rounded-lg px-3 py-3 text-sm"
              style={{
                backgroundColor: 'var(--bg-elevated)',
                border: '1px solid var(--border-primary)',
                color: 'var(--text-secondary)',
              }}
            >
              <label className="flex items-center justify-between gap-3">
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
            <Button
              data-testid="share-create-button"
              variant="primary"
              onClick={handleCreateShare}
              disabled={!canShare}
              className="w-full"
            >
              {isSharing ? 'Creating link...' : 'Create Share Link'}
            </Button>
          ) : (
            <div className="space-y-4">
              <div>
                <Label htmlFor="share-link">Link</Label>
                <div className="flex items-center gap-2">
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
                    title="Copy link"
                  >
                    <TbCopy size={16} />
                  </IconButton>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Default View</Label>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant={shareMode === 'customizer' ? 'primary' : 'secondary'}
                    onClick={() => setShareMode('customizer')}
                    data-testid="share-mode-customizer"
                  >
                    Customizer
                  </Button>
                  <Button
                    type="button"
                    variant={shareMode === 'editor' ? 'primary' : 'secondary'}
                    onClick={() => setShareMode('editor')}
                    data-testid="share-mode-editor"
                  >
                    Full Editor
                  </Button>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div
                  className="flex items-center gap-2 text-sm"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  {copied ? <TbCheck size={16} style={{ color: 'var(--color-success)' }} /> : null}
                  <span>
                    {copied
                      ? 'Link copied to clipboard'
                      : 'Anyone with the link can view a copy without changing your original'}
                  </span>
                </div>

                <a
                  href={currentShareUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-sm"
                  style={{ color: 'var(--accent-primary)' }}
                >
                  Open
                  <TbExternalLink size={14} />
                </a>
              </div>
            </div>
          )}
        </div>

        <div
          className="flex items-center justify-end gap-2 px-6 py-3"
          style={{ borderTop: '1px solid var(--border-primary)' }}
        >
          <Button variant="ghost" onClick={onClose} disabled={isSharing}>
            {shareId ? 'Done' : 'Cancel'}
          </Button>
        </div>
      </div>
    </div>
  );
}
