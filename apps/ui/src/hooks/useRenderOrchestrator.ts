import { useCallback, useEffect, useRef } from 'react';
import { useOpenScad, type RenderOwner, type RenderSnapshot } from './useOpenScad';
import { useRenderRequestStore } from '../stores/renderRequestStore';
import { useProjectStore } from '../stores/projectStore';
import type { RenderTrigger } from '../analytics/runtime';
import type { LibrarySettings } from '../stores/settingsStore';
import type { IRenderService } from '../services/renderService';
import { useAnalytics } from '../analytics/runtime';
import { getPlatform } from '../platform';
import { resolveWorkingDirDeps } from '../utils/resolveWorkingDirDeps';
import { notifyError } from '../utils/notifications';

interface UseRenderOrchestratorOptions {
  source: string;
  contentVersion: number;
  workingDir?: string | null;
  autoRenderOnIdle?: boolean;
  autoRenderDelayMs?: number;
  library?: LibrarySettings;
  createRenderOwner?: () => RenderOwner | null;
  suppressInitialRender?: boolean;
  onRenderSettled?: (event: {
    owner: RenderOwner | null;
    code: string;
    trigger: RenderTrigger;
    snapshot: RenderSnapshot;
  }) => void;
  testOverrides?: {
    analytics?: ReturnType<typeof useAnalytics>;
    renderService?: IRenderService;
    getPlatform?: typeof getPlatform;
    resolveWorkingDirDeps?: typeof resolveWorkingDirDeps;
    notifyError?: typeof notifyError;
    isDevRuntime?: boolean;
  };
}

export function useRenderOrchestrator(options: UseRenderOrchestratorOptions) {
  const {
    source,
    contentVersion,
    autoRenderOnIdle = false,
    autoRenderDelayMs = 500,
    suppressInitialRender = false,
  } = options;

  // Delegate WASM, caching, blob URLs, etc. to useOpenScad.
  // Disable its internal auto-render and initial-render — we handle both.
  const openscad = useOpenScad({
    ...options,
    autoRenderOnIdle: false,
    suppressInitialRender: true,
  });

  const { ready, renderCode, renderWithTrigger } = openscad;

  // --- Process render requests from renderRequestStore ---
  const pendingRequest = useRenderRequestStore((s) => s.pendingRequest);
  const consumeRequest = useRenderRequestStore((s) => s.consumeRequest);
  const lastRenderedSourceRef = useRef(source);
  const lastRenderedVersionRef = useRef(contentVersion);
  const autoRenderTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const markLatestRenderRequest = useCallback(
    (nextSource: string) => {
      lastRenderedSourceRef.current = nextSource;
      lastRenderedVersionRef.current = contentVersion;
    },
    [contentVersion]
  );

  useEffect(() => {
    if (!pendingRequest || !ready) return;

    const { trigger, immediate, code } = pendingRequest;
    consumeRequest();

    if (code) {
      markLatestRenderRequest(code);
      renderCode(code, trigger);
    } else if (immediate) {
      markLatestRenderRequest(source);
      renderWithTrigger(trigger);
    }
    // Non-immediate requests without code are handled by the auto-render-on-idle
    // effect below (they bump contentVersion which triggers the debounce).
  }, [
    consumeRequest,
    markLatestRenderRequest,
    pendingRequest,
    ready,
    renderCode,
    renderWithTrigger,
    source,
  ]);

  // --- Initial render on WASM ready ---
  const hasInitialRendered = useRef(false);
  useEffect(() => {
    if (ready && source && !suppressInitialRender && !hasInitialRendered.current) {
      hasInitialRendered.current = true;
      markLatestRenderRequest(source);
      renderCode(source, 'initial');
    }
  }, [markLatestRenderRequest, ready, renderCode, source, suppressInitialRender]);

  // --- Re-render when render target changes ---
  const renderTargetPath = useProjectStore((s) => s.renderTargetPath);
  const prevRenderTargetRef = useRef(renderTargetPath);
  useEffect(() => {
    if (!ready) return;
    if (renderTargetPath && renderTargetPath !== prevRenderTargetRef.current) {
      prevRenderTargetRef.current = renderTargetPath;
      markLatestRenderRequest(source);
      renderWithTrigger('code_update');
    }
  }, [markLatestRenderRequest, ready, renderTargetPath, renderWithTrigger, source]);

  // --- Auto-render on idle (debounced) ---

  useEffect(() => {
    if (!autoRenderOnIdle || !ready) return;
    if (
      source === lastRenderedSourceRef.current &&
      contentVersion === lastRenderedVersionRef.current
    ) {
      return;
    }

    if (autoRenderTimerRef.current) {
      clearTimeout(autoRenderTimerRef.current);
    }

    autoRenderTimerRef.current = setTimeout(() => {
      lastRenderedSourceRef.current = source;
      lastRenderedVersionRef.current = contentVersion;
      renderWithTrigger('auto_idle');
    }, autoRenderDelayMs);

    return () => {
      if (autoRenderTimerRef.current) {
        clearTimeout(autoRenderTimerRef.current);
      }
    };
  }, [source, contentVersion, autoRenderOnIdle, autoRenderDelayMs, ready, renderWithTrigger]);

  return openscad;
}
