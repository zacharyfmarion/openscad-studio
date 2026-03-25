import { useCallback, useEffect, useMemo, useState } from 'react';
import { getShare } from '../services/shareService';
import { parseShareContext } from '../services/shareRouting';
import type { ShareContext, ShareData } from '../types/share';

export interface ShareLoaderResult {
  isLoading: boolean;
  shareData: ShareData | null;
  error: string | null;
  shareContext: ShareContext | null;
  retry: () => void;
}

export function useShareLoader(enabled: boolean = true): ShareLoaderResult {
  const shareContext = useMemo(() => {
    if (typeof window === 'undefined') {
      return null;
    }

    return (
      window.__SHARE_CONTEXT ?? parseShareContext(window.location.pathname, window.location.search)
    );
  }, []);
  const [isLoading, setIsLoading] = useState(Boolean(enabled && shareContext));
  const [shareData, setShareData] = useState<ShareData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  const retry = useCallback(() => {
    setIsLoading(Boolean(enabled && shareContext));
    setError(null);
    setAttempt((current) => current + 1);
  }, [enabled, shareContext]);

  useEffect(() => {
    if (!enabled || !shareContext) {
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setError(null);

    void getShare(shareContext.shareId)
      .then((nextShare) => {
        if (cancelled) {
          return;
        }

        setShareData(nextShare);
        setIsLoading(false);
        window.history.replaceState({}, document.title, '/');
      })
      .catch((err: unknown) => {
        if (cancelled) {
          return;
        }

        const message =
          err instanceof Error && 'status' in err && err.status === 404
            ? "This design doesn't exist or has been removed."
            : "Couldn't load this design. Check your connection.";
        setShareData(null);
        setError(message);
        setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [attempt, enabled, shareContext]);

  return {
    isLoading,
    shareData,
    error,
    shareContext: enabled ? shareContext : null,
    retry,
  };
}
