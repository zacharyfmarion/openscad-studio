import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useAnalytics } from '../analytics/runtime';
import { getShare } from '../services/shareService';
import { parseShareContext } from '../services/shareRouting';
import { isShareEntryBlockingPhase, useShareEntryStore } from '../stores/shareEntryStore';
import type { RenderSnapshot } from './useOpenScad';
import type { ShareContext, ShareData, ShareOrigin, ShareEntryPhase } from '../types/share';

interface UseShareEntryOptions {
  renderReady: boolean;
  openSharedDocument: (share: ShareData) => string;
  renderSharedDocument: (args: {
    tabId: string;
    code: string;
  }) => Promise<RenderSnapshot | null> | RenderSnapshot | null;
  openFallbackEditor: () => void;
}

export interface UseShareEntryResult {
  context: ShareContext | null;
  shareData: ShareData | null;
  origin: ShareOrigin | null;
  error: string | null;
  phase: ShareEntryPhase;
  shouldBlockUi: boolean;
  shouldShowError: boolean;
  isActive: boolean;
  retry: () => void;
  skip: () => void;
  dismissBanner: () => void;
  markVisualReady: () => void;
  isBannerDismissed: boolean;
}

export function useShareEntry({
  renderReady,
  openSharedDocument,
  renderSharedDocument,
  openFallbackEditor,
}: UseShareEntryOptions): UseShareEntryResult {
  const routeContext = useMemo(() => {
    if (typeof window === 'undefined') {
      return null;
    }

    return (
      window.__SHARE_CONTEXT ?? parseShareContext(window.location.pathname, window.location.search)
    );
  }, []);

  const context = useShareEntryStore((state) => state.context);
  const phase = useShareEntryStore((state) => state.phase);
  const shareData = useShareEntryStore((state) => state.shareData);
  const origin = useShareEntryStore((state) => state.origin);
  const error = useShareEntryStore((state) => state.error);
  const isBannerDismissed = useShareEntryStore((state) => state.isBannerDismissed);
  const setContext = useShareEntryStore((state) => state.setContext);
  const startFetching = useShareEntryStore((state) => state.startFetching);
  const setShareData = useShareEntryStore((state) => state.setShareData);
  const startApplying = useShareEntryStore((state) => state.startApplying);
  const startRendering = useShareEntryStore((state) => state.startRendering);
  const markReady = useShareEntryStore((state) => state.markReady);
  const fail = useShareEntryStore((state) => state.fail);
  const retryStore = useShareEntryStore((state) => state.retry);
  const skipStore = useShareEntryStore((state) => state.skip);
  const dismissBanner = useShareEntryStore((state) => state.dismissBanner);
  const analytics = useAnalytics();
  const fetchTokenRef = useRef(0);

  useEffect(() => {
    setContext(routeContext);
  }, [routeContext, setContext]);

  useEffect(() => {
    if (!context || phase !== 'idle') {
      return;
    }

    const fetchToken = fetchTokenRef.current + 1;
    fetchTokenRef.current = fetchToken;
    startFetching();

    void getShare(context.shareId)
      .then((nextShare) => {
        if (fetchTokenRef.current !== fetchToken) {
          return;
        }

        analytics.track('share loaded', {
          share_mode: context.mode,
          has_forked_from: Boolean(nextShare.forkedFrom),
        });
        setShareData(nextShare);
        startApplying();
        window.history.replaceState({}, document.title, '/');
      })
      .catch((err: unknown) => {
        if (fetchTokenRef.current !== fetchToken) {
          return;
        }

        const isNotFound = err instanceof Error && 'status' in err && err.status === 404;
        analytics.track('share load failed', {
          is_not_found: isNotFound,
        });
        const message = isNotFound
          ? "This design doesn't exist or has been removed."
          : "Couldn't load this design. Check your connection.";
        fail(message);
      });
  }, [analytics, context, fail, phase, setShareData, startApplying, startFetching]);

  useEffect(() => {
    if (!context || !shareData || phase !== 'applying' || !renderReady) {
      return;
    }

    const targetTabId = openSharedDocument(shareData);
    startRendering({
      origin: {
        shareId: context.shareId,
        mode: context.mode,
        title: shareData.title,
        forkedFrom: shareData.forkedFrom,
      },
      targetTabId,
    });

    Promise.resolve(renderSharedDocument({ tabId: targetTabId, code: shareData.code }))
      .then((snapshot) => {
        if (!snapshot || snapshot.error || !snapshot.previewSrc) {
          markReady();
        }
      })
      .catch((renderError: unknown) => {
        const message =
          renderError instanceof Error
            ? renderError.message
            : 'Rendering failed while opening the shared design.';
        fail(message);
      });
  }, [
    context,
    fail,
    markReady,
    openSharedDocument,
    phase,
    renderReady,
    renderSharedDocument,
    shareData,
    startRendering,
  ]);

  const retry = useCallback(() => {
    retryStore();
  }, [retryStore]);

  const skip = useCallback(() => {
    skipStore();
    openFallbackEditor();
  }, [openFallbackEditor, skipStore]);

  const markVisualReady = useCallback(() => {
    markReady();
  }, [markReady]);

  return {
    context,
    shareData,
    origin,
    error,
    phase,
    shouldBlockUi: Boolean(context) && isShareEntryBlockingPhase(phase),
    shouldShowError: Boolean(context) && phase === 'error',
    isActive: Boolean(context) && phase !== 'skipped',
    retry,
    skip,
    dismissBanner,
    markVisualReady,
    isBannerDismissed,
  };
}
