import { useState, useEffect, useCallback, useRef } from 'react';
import { useAnalytics, type RenderTrigger } from '../analytics/runtime';
import { RenderService, type Diagnostic } from '../services/renderService';
import { getPlatform } from '../platform';
import type { LibrarySettings } from '../stores/settingsStore';
import { resolveWorkingDirDeps } from '../utils/resolveWorkingDirDeps';
import { notifyError } from '../utils/notifications';
import { hasRenderableOutput } from './renderOutput';
export type RenderKind = 'mesh' | 'svg';
export interface RenderOwner {
  tabId: string;
  requestId: number;
}

export interface RenderSnapshot {
  previewSrc: string;
  previewKind: RenderKind;
  diagnostics: Diagnostic[];
  error: string;
  dimensionMode: '2d' | '3d';
}

interface UseOpenScadOptions {
  initialSource?: string;
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
    renderService?: RenderService;
    getPlatform?: typeof getPlatform;
    resolveWorkingDirDeps?: typeof resolveWorkingDirDeps;
    notifyError?: typeof notifyError;
    isDevRuntime?: boolean;
  };
}

export function useOpenScad(options: UseOpenScadOptions = {}) {
  const defaultAnalytics = useAnalytics();
  const {
    initialSource = '// Type your OpenSCAD code here\ncube([10, 10, 10]);',
    autoRenderOnIdle = false,
    autoRenderDelayMs = 500,
    library,
    createRenderOwner,
    suppressInitialRender = false,
    onRenderSettled,
    testOverrides,
  } = options;
  const analytics = testOverrides?.analytics ?? defaultAnalytics;
  const getPlatformImpl = testOverrides?.getPlatform ?? getPlatform;
  const resolveWorkingDirDepsImpl = testOverrides?.resolveWorkingDirDeps ?? resolveWorkingDirDeps;
  const notifyErrorImpl = testOverrides?.notifyError ?? notifyError;
  const [source, setSource] = useState<string>(initialSource);
  const [ready, setReady] = useState(false);
  const [previewSrc, setPreviewSrc] = useState<string>('');
  const [previewKind, setPreviewKind] = useState<RenderKind>('mesh');
  const [diagnostics, setDiagnostics] = useState<Diagnostic[]>([]);
  const [isRendering, setIsRendering] = useState(false);
  const [error, setError] = useState<string>('');
  const [dimensionMode, setDimensionMode] = useState<'2d' | '3d'>('3d');
  const isDevRuntime =
    testOverrides?.isDevRuntime ??
    Boolean((import.meta as ImportMeta & { env?: { DEV?: boolean } }).env?.DEV);

  // Track Blob URLs for cleanup
  const prevBlobUrlRef = useRef<string>('');

  const renderServiceRef = useRef<RenderService>(
    testOverrides?.renderService ?? RenderService.getInstance()
  );
  const [auxiliaryFiles, setAuxiliaryFiles] = useState<Record<string, string>>({});
  const auxiliaryFilesRef = useRef<Record<string, string>>({});
  const auxFilesPromiseRef = useRef<Promise<void>>(Promise.resolve());

  // Separate refs for library files and working directory files
  const libraryFilesRef = useRef<Record<string, string>>({});
  const workingDirFilesRef = useRef<Record<string, string>>({});

  // Serialize customPaths for stable dependency comparison
  const customPathsKey = library?.customPaths.join('\0') ?? '';

  // Helper to merge library + working dir files and update state only if changed
  const mergeAndSetAuxFiles = useCallback(() => {
    const merged: Record<string, string> = {
      ...libraryFilesRef.current,
      ...workingDirFilesRef.current,
    };

    // Only update if the file map actually changed (avoid triggering re-renders)
    const prev = auxiliaryFilesRef.current;
    const prevKeys = Object.keys(prev);
    const mergedKeys = Object.keys(merged);

    if (prevKeys.length === mergedKeys.length && mergedKeys.every((k) => prev[k] === merged[k])) {
      // No change — skip update
      return;
    }

    auxiliaryFilesRef.current = merged;
    auxiliaryFilesRef.current = merged;
    setAuxiliaryFiles(merged);
  }, []);

  // Effect 1: Load library files (rarely changes — only when library settings change)
  useEffect(() => {
    const platform = getPlatformImpl();

    const loadLibraryFiles = async () => {
      const files: Record<string, string> = {};

      if (library) {
        const systemPaths = library.autoDiscoverSystem ? await platform.getLibraryPaths() : [];
        const allLibPaths = [...systemPaths, ...library.customPaths];

        for (const libPath of allLibPaths) {
          try {
            const libFiles = await platform.readDirectoryFiles(libPath);
            Object.assign(files, libFiles);
            Object.assign(files, libFiles);
          } catch (err) {
            console.warn(`[useOpenScad] Failed to read library path ${libPath}:`, err);
          }
        }
      }

      libraryFilesRef.current = files;
      mergeAndSetAuxFiles();
    };

    // Chain onto the aux files promise so doRender waits for this
    auxFilesPromiseRef.current = loadLibraryFiles();
  }, [customPathsKey, getPlatformImpl, library?.autoDiscoverSystem, mergeAndSetAuxFiles]); // eslint-disable-line react-hooks/exhaustive-deps

  // Effect 2: Resolve working directory dependencies at render time.
  // Instead of blindly scanning the working directory (which is slow for large dirs
  // like ~/Documents), we parse include/use statements and read only referenced files.
  // This is done in doRender via resolveWorkingDirDeps, not in an effect,
  // because the deps depend on the code being rendered (which may change on each render).
  // We keep a ref to workingDir so doRender can access it.
  const workingDirRef = useRef(options.workingDir);
  useEffect(() => {
    workingDirRef.current = options.workingDir;
  }, [options.workingDir]);

  // Initialize WASM on mount
  useEffect(() => {
    const service = renderServiceRef.current;
    service
      .init()
      .then(() => {
        setReady(true);
      })
      .catch((err) => {
        setError(`Failed to initialize OpenSCAD WASM: ${err}`);
        notifyErrorImpl({
          operation: 'openscad-init',
          error: err,
          fallbackMessage: 'Failed to initialize OpenSCAD rendering',
          toastId: 'openscad-init-error',
          logLabel: '[useOpenScad] WASM init error',
        });
      });
  }, [notifyErrorImpl]);

  const doRender = useCallback(
    async (code: string, dimension: '2d' | '3d' = '3d', trigger: RenderTrigger = 'manual') => {
      if (!renderServiceRef.current) {
        setError('RenderService not available');
        return null;
      }

      const renderStartedAt = performance.now();
      const owner = createRenderOwner?.() ?? null;
      let cacheHit = false;
      let resolvedDimension: '2d' | '3d' = dimension;
      let switchedDimension = false;
      let settledSnapshot: RenderSnapshot | null = null;

      const trackRenderCompleted = (renderDiagnostics: Diagnostic[]) => {
        analytics.track('render completed', {
          trigger,
          duration_ms: Math.round(performance.now() - renderStartedAt),
          cache_hit: cacheHit,
          requested_dimension: dimension,
          resolved_dimension: resolvedDimension,
          switched_dimension: switchedDimension,
          warning_count: renderDiagnostics.filter((d) => d.severity === 'warning').length,
          error_count: renderDiagnostics.filter((d) => d.severity === 'error').length,
        });
      };

      setIsRendering(true);
      setError('');

      try {
        // Fast path: check cache BEFORE waiting for aux files to load.
        // If the render result is already cached, return instantly (no file reload wait).
        const auxFiles =
          Object.keys(auxiliaryFilesRef.current).length > 0 ? auxiliaryFilesRef.current : undefined;
        const cached = await renderServiceRef.current.getCached(code, {
          view: dimension,
          backend: 'manifold',
          auxiliaryFiles: auxFiles,
        });
        // Only short-circuit on cached renders that actually contain displayable output.
        // Empty 3D results for 2D code still need to flow through the dimension-fallback path.
        if (cached && hasRenderableOutput(cached.output)) {
          cacheHit = true;
          setDimensionMode(resolvedDimension);
          setDiagnostics(cached.diagnostics);
          setPreviewKind(cached.kind);

          const mimeType = cached.kind === 'mesh' ? 'application/octet-stream' : 'image/svg+xml';
          const blob = new Blob([cached.output], { type: mimeType });
          const blobUrl = URL.createObjectURL(blob);
          prevBlobUrlRef.current = blobUrl;
          setPreviewSrc(blobUrl);
          settledSnapshot = {
            previewSrc: blobUrl,
            previewKind: cached.kind,
            diagnostics: cached.diagnostics,
            error: '',
            dimensionMode: resolvedDimension,
          };

          setIsRendering(false);
          trackRenderCompleted(cached.diagnostics);
          return settledSnapshot;
        }

        // Cache miss — wait for library files to finish loading
        await auxFilesPromiseRef.current;

        // Resolve working directory dependencies by parsing include/use statements
        // instead of blindly scanning the entire working directory
        const workingDir = workingDirRef.current;
        let renderAuxFiles = libraryFilesRef.current;

        if (workingDir) {
          const platform = getPlatformImpl();
          const workingDirFiles = await resolveWorkingDirDepsImpl(code, {
            workingDir,
            libraryFiles: libraryFilesRef.current,
            platform,
          });

          if (Object.keys(workingDirFiles).length > 0) {
            renderAuxFiles = { ...libraryFilesRef.current, ...workingDirFiles };
          }
        }

        // Update refs so the cache check uses consistent data on next render
        workingDirFilesRef.current =
          renderAuxFiles === libraryFilesRef.current
            ? {}
            : Object.fromEntries(
                Object.entries(renderAuxFiles).filter(([k]) => !(k in libraryFilesRef.current))
              );
        mergeAndSetAuxFiles();

        const result = await renderServiceRef.current.render(code, {
          view: dimension,
          backend: 'manifold',
          auxiliaryFiles: Object.keys(renderAuxFiles).length > 0 ? renderAuxFiles : undefined,
        });

        setDimensionMode(resolvedDimension);
        setDiagnostics(result.diagnostics);
        setPreviewKind(result.kind);

        // Revoke previous Blob URL to prevent memory leaks
        if (result.output.length > 0) {
          // Create Blob URL from output bytes
          const mimeType = result.kind === 'mesh' ? 'application/octet-stream' : 'image/svg+xml';
          const blob = new Blob([result.output], { type: mimeType });
          const blobUrl = URL.createObjectURL(blob);
          prevBlobUrlRef.current = blobUrl;
          setPreviewSrc(blobUrl);
          settledSnapshot = {
            previewSrc: blobUrl,
            previewKind: result.kind,
            diagnostics: result.diagnostics,
            error: '',
            dimensionMode: resolvedDimension,
          };
          trackRenderCompleted(result.diagnostics);
        } else {
          // No output — check for dimension mismatch and auto-retry with opposite mode.
          // The WASM Manifold backend silently produces empty output (no diagnostics)
          // when rendering 2D code in 3D mode or vice versa.
          const hasErrors = result.diagnostics.some((d) => d.severity === 'error');

          // Also check for explicit dimension mismatch error messages (CLI OpenSCAD)
          const errorMessages = result.diagnostics
            .filter((d) => d.severity === 'error')
            .map((d) => d.message.toLowerCase())
            .join(' ');
          const hasExplicitMismatch =
            errorMessages.includes('not a 3d object') ||
            errorMessages.includes('not a 2d object') ||
            (errorMessages.includes('2d') && errorMessages.includes('3d mode')) ||
            (errorMessages.includes('3d') && errorMessages.includes('2d mode'));

          if (!hasErrors || hasExplicitMismatch) {
            const newDimension: '2d' | '3d' = dimension === '3d' ? '2d' : '3d';

            // Retry render with the opposite dimension
            const retryResult = await renderServiceRef.current.render(code, {
              view: newDimension,
              backend: 'manifold',
              auxiliaryFiles:
                Object.keys(auxiliaryFilesRef.current).length > 0
                  ? auxiliaryFilesRef.current
                  : undefined,
            });

            if (retryResult.output.length > 0) {
              // Opposite dimension worked — switch to it
              resolvedDimension = newDimension;
              switchedDimension = true;
              setDimensionMode(newDimension);
              setDiagnostics(retryResult.diagnostics);
              setPreviewKind(retryResult.kind);

              const mimeType =
                retryResult.kind === 'mesh' ? 'application/octet-stream' : 'image/svg+xml';
              const blob = new Blob([retryResult.output], { type: mimeType });
              const blobUrl = URL.createObjectURL(blob);
              prevBlobUrlRef.current = blobUrl;
              setPreviewSrc(blobUrl);
              settledSnapshot = {
                previewSrc: blobUrl,
                previewKind: retryResult.kind,
                diagnostics: retryResult.diagnostics,
                error: '',
                dimensionMode: resolvedDimension,
              };
              trackRenderCompleted(retryResult.diagnostics);
            } else {
              // Neither dimension produced output
              setError('Render produced no output');
              setPreviewSrc('');
              settledSnapshot = {
                previewSrc: '',
                previewKind: retryResult.kind,
                diagnostics: retryResult.diagnostics,
                error: 'Render produced no output',
                dimensionMode: resolvedDimension,
              };
              trackRenderCompleted(retryResult.diagnostics);
            }
          } else {
            // Has real errors (not dimension mismatch) — report them
            const errors = result.diagnostics.filter((d) => d.severity === 'error');
            const errorMessage = errors.map((e) => e.message).join('\n');
            setError(errorMessage);
            setPreviewSrc('');
            settledSnapshot = {
              previewSrc: '',
              previewKind: result.kind,
              diagnostics: result.diagnostics,
              error: errorMessage,
              dimensionMode: resolvedDimension,
            };
            trackRenderCompleted(result.diagnostics);
          }
        }
      } catch (err) {
        const errorMsg = typeof err === 'string' ? err : String(err);
        setError(errorMsg);
        setPreviewSrc('');
        settledSnapshot = {
          previewSrc: '',
          previewKind: dimension === '2d' ? 'svg' : 'mesh',
          diagnostics: [],
          error: errorMsg,
          dimensionMode: resolvedDimension,
        };
        notifyErrorImpl({
          operation: 'render-runtime',
          error: err,
          fallbackMessage: 'Rendering failed unexpectedly',
          toastId: 'render-runtime-error',
          logLabel: '[useOpenScad] Render error',
        });
      } finally {
        setIsRendering(false);
        if (settledSnapshot) {
          onRenderSettled?.({
            owner,
            code,
            trigger,
            snapshot: settledSnapshot,
          });
        }
      }

      return settledSnapshot;
    },
    [
      analytics,
      createRenderOwner,
      getPlatformImpl,
      mergeAndSetAuxFiles,
      notifyErrorImpl,
      onRenderSettled,
      resolveWorkingDirDepsImpl,
    ]
  );

  const updateSource = useCallback((newSource: string) => {
    setSource(newSource);
  }, []);

  // Atomically update source AND render with the new code.
  // This bypasses the stale-closure problem where manualRender() would
  // render with the previous `source` because React hasn't flushed the
  // state update from updateSource() yet.
  const updateSourceAndRender = useCallback(
    (newSource: string, trigger: RenderTrigger = 'code_update') => {
      setSource(newSource);
      lastRenderedSourceRef.current = newSource;
      return doRender(newSource, dimensionMode, trigger);
    },
    [dimensionMode, doRender]
  );

  // Initial render when WASM is ready
  useEffect(() => {
    if (!suppressInitialRender && ready && source) {
      lastRenderedSourceRef.current = source;
      void doRender(source, dimensionMode, 'initial');
    }
  }, [ready, suppressInitialRender]); // eslint-disable-line react-hooks/exhaustive-deps

  // Function to clear preview (for when opening new files)
  const clearPreview = useCallback(() => {
    if (prevBlobUrlRef.current) {
      URL.revokeObjectURL(prevBlobUrlRef.current);
      prevBlobUrlRef.current = '';
    }
    setPreviewSrc('');
    setDiagnostics([]);
    setError('');
  }, []);

  // Debounced auto-render on idle
  const autoRenderTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastRenderedSourceRef = useRef<string>(source);

  // Manual render function (stable callback)
  const manualRender = useCallback(() => {
    lastRenderedSourceRef.current = source;
    return doRender(source, dimensionMode, 'manual');
  }, [source, dimensionMode, doRender]);

  // Render on save function (stable callback)
  const renderOnSave = useCallback(() => {
    lastRenderedSourceRef.current = source;
    return doRender(source, dimensionMode, 'save');
  }, [source, dimensionMode, doRender]);

  const renderWithTrigger = useCallback(
    (trigger: RenderTrigger) => {
      lastRenderedSourceRef.current = source;
      return doRender(source, dimensionMode, trigger);
    },
    [dimensionMode, doRender, source]
  );

  useEffect(() => {
    if (!autoRenderOnIdle || !ready) return;
    if (source === lastRenderedSourceRef.current) return;

    if (autoRenderTimerRef.current) {
      clearTimeout(autoRenderTimerRef.current);
    }

    autoRenderTimerRef.current = setTimeout(() => {
      lastRenderedSourceRef.current = source;
      void doRender(source, dimensionMode, 'auto_idle');
    }, autoRenderDelayMs);

    return () => {
      if (autoRenderTimerRef.current) {
        clearTimeout(autoRenderTimerRef.current);
      }
    };
  }, [source, autoRenderOnIdle, autoRenderDelayMs, ready, doRender, dimensionMode]);

  // Cleanup Blob URLs on unmount
  useEffect(() => {
    return () => {
      if (prevBlobUrlRef.current) {
        URL.revokeObjectURL(prevBlobUrlRef.current);
      }
    };
  }, []);

  // Expose render functions for E2E testing
  useEffect(() => {
    if (isDevRuntime || window.__PLAYWRIGHT__) {
      window.__TEST_OPENSCAD__ = {
        doRender,
        manualRender,
        updateSourceAndRender,
        renderWithTrigger,
        dimensionMode,
        renderService: renderServiceRef.current,
        setTestAuxiliaryFiles: (files: Record<string, string>) => {
          // Set both library and auxiliary refs so doRender picks these up
          libraryFilesRef.current = files;
          auxiliaryFilesRef.current = files;
          setAuxiliaryFiles(files);
        },
      };
    }
    return () => {
      if (window.__TEST_OPENSCAD__) {
        delete window.__TEST_OPENSCAD__;
      }
    };
  }, [
    dimensionMode,
    doRender,
    isDevRuntime,
    manualRender,
    renderWithTrigger,
    updateSourceAndRender,
  ]);

  return {
    source,
    updateSource,
    updateSourceAndRender,
    previewSrc,
    previewKind,
    diagnostics,
    isRendering,
    error,
    ready,
    dimensionMode,
    manualRender,
    renderOnSave,
    renderWithTrigger,
    clearPreview,
    auxiliaryFiles,
  };
}
