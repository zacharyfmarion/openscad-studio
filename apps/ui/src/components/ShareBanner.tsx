import { useEffect, useState } from 'react';
import { TbArrowUpRight, TbGitBranch, TbX } from 'react-icons/tb';
import { getShare } from '../services/shareService';
import type { ShareOrigin } from '../types/share';
import { Button } from './ui';

interface ShareBannerProps {
  origin: ShareOrigin;
  onShareRemix: () => void;
  onDismiss: () => void;
}

export function ShareBanner({ origin, onShareRemix, onDismiss }: ShareBannerProps) {
  const [parentTitle, setParentTitle] = useState<string | null>(null);

  useEffect(() => {
    if (!origin.forkedFrom) {
      setParentTitle(null);
      return;
    }

    let cancelled = false;
    void getShare(origin.forkedFrom)
      .then((share) => {
        if (!cancelled) {
          setParentTitle(share.title);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setParentTitle(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [origin.forkedFrom]);

  return (
    <div
      data-testid="share-banner"
      className="flex items-center justify-between gap-3 px-4 py-2 text-sm"
      style={{
        background:
          'linear-gradient(90deg, color-mix(in srgb, var(--accent-primary) 18%, var(--bg-secondary)), var(--bg-secondary))',
        borderBottom: '1px solid var(--border-primary)',
        color: 'var(--text-primary)',
      }}
    >
      <div className="min-w-0">
        <div className="font-medium">
          Shared design: &quot;{origin.title}&quot;
        </div>
        {origin.forkedFrom ? (
          <div className="flex items-center gap-1 text-xs" style={{ color: 'var(--text-secondary)' }}>
            <TbGitBranch size={12} />
            <span>Remixed from {parentTitle ? `"${parentTitle}"` : 'another shared design'}</span>
          </div>
        ) : (
          <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>
            You can edit this copy and share your remix.
          </div>
        )}
      </div>

      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={onShareRemix}
          data-testid="share-remix-button"
        >
          <span className="inline-flex items-center gap-1">
            Share Your Remix
            <TbArrowUpRight size={14} />
          </span>
        </Button>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss shared design banner"
          className="rounded-md p-1"
          style={{ color: 'var(--text-secondary)' }}
        >
          <TbX size={16} />
        </button>
      </div>
    </div>
  );
}
