import { useState, useEffect, useCallback, useRef } from 'react';
import { useAnalytics, type RenderTrigger } from '../analytics/runtime';
import {
  getRenderService,
  ensureRenderService,
  type IRenderService,
  type Diagnostic,
} from '../services/renderService';
import { getPlatform } from '../platform';
import type { LibrarySettings } from '../stores/settingsStore';
import { resolveWorkingDirDeps } from '../utils/resolveWorkingDirDeps';
import { getProjectState, getAuxiliaryFilesForRender } from '../stores/projectStore';
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
  /** Render target content — provided by the caller (derived from projectStore). */
  source?: string;
  /**
   * Monotonically increasing counter that changes when any project file is
   * mutated. Used to trigger re-renders when an included dependency (not the
   * render target itself) changes.
   */
  contentVersion?: number;
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

export function useOpenScad(options: UseOpenScadOptions = {}) {
  const defaultAnalytics = useAnalytics();
  const {
    source = '// Type your OpenSCAD code here\ncube([10, 10, 10]);',
    contentVersion = 0,
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

  const renderServiceRef = useRef<IRenderService>(
    testOverrides?.renderService ?? getRenderService()
  );
  const [auxiliaryFiles, setAuxiliaryFiles] = useState<Record<string, string>>({});
  const auxiliaryFilesRef = useRef<Record<string, string>>({});
  const auxFilesPromiseRef = useRef<Promise<void>>(Promise.resolve());

  // Separate refs for library files and working directory files
  const libraryFilesRef = useRef<Record<string, string>>({});
  const libraryPathsRef = useRef<string[]>([]);
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
        libraryPathsRef.current = allLibPaths;

        for (const libPath of allLibPaths) {
          try {
            const libFiles = await platform.readDirectoryFiles(libPath);
            Object.assign(files, libFiles);
          } catch (err) {
            console.warn(`[useOpenScad] Failed to read library path ${libPath}:`, err);
          }
        }
      } else {
        libraryPathsRef.current = [];
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

  // Initialize render service on mount.
  // On Tauri, this waits for NativeRenderService to load before calling init().
  // On web, ensureRenderService() resolves immediately with WasmRenderService.
  useEffect(() => {
    const initService = testOverrides?.renderService
      ? Promise.resolve(testOverrides.renderService)
      : ensureRenderService();

    initService
      .then((service) => {
        renderServiceRef.current = service;
        return service.init();
      })
      .then(() => {
        setReady(true);
      })
      .catch((err) => {
        setError(`Failed to initialize OpenSCAD: ${err}`);
        notifyErrorImpl({
          operation: 'openscad-init',
          error: err,
          fallbackMessage: 'Failed to initialize OpenSCAD rendering',
          toastId: 'openscad-init-error',
          logLabel: '[useOpenScad] render service init error',
        });
      });
  }, [notifyErrorImpl]); // eslint-disable-line react-hooks/exhaustive-deps

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
        // Resolve the current dependency bundle before touching the cache so
        // dependency-only edits invalidate cached renders correctly.
        await auxFilesPromiseRef.current;

        // Resolve working directory dependencies by parsing include/use statements
        // instead of blindly scanning the entire working directory.
        // On web (no workingDir), project store files are the only source.
        const workingDir = workingDirRef.current;
        const projectFiles = getAuxiliaryFilesForRender(getProjectState());

        // Build project-only auxiliary files (no library files — those are
        // passed separately via libraryFiles/libraryPaths)
        let projectAuxFiles: Record<string, string> = { ...projectFiles };

        if (workingDir) {
          const platform = getPlatformImpl();
          const renderTargetPath = getProjectState().renderTargetPath;
          const rtLastSlash = renderTargetPath?.lastIndexOf('/') ?? -1;
          const renderTargetDir =
            renderTargetPath && rtLastSlash > 0
              ? renderTargetPath.substring(0, rtLastSlash)
              : undefined;
          const workingDirFiles = await resolveWorkingDirDepsImpl(code, {
            workingDir,
            libraryFiles: libraryFilesRef.current,
            platform,
            projectFiles,
            renderTargetDir,
          });

          if (Object.keys(workingDirFiles).length > 0) {
            projectAuxFiles = { ...projectAuxFiles, ...workingDirFiles };
          }
        }

        // Update refs so the cache check uses consistent data on next render
        workingDirFilesRef.current = Object.fromEntries(
          Object.entries(projectAuxFiles).filter(([k]) => !(k in projectFiles))
        );
        mergeAndSetAuxFiles();

        const libraryFiles = libraryFilesRef.current;
        // Merge all files for the render call — both services need library
        // file contents (WASM for virtual FS, native because -L is not
        // supported by the bundled OpenSCAD snapshot).  libraryPaths is
        // passed so the native renderer can avoid writing library files
        // into the project directory.
        const allAuxFiles = { ...libraryFiles, ...projectAuxFiles };
        const renderOptions = {
          view: dimension,
          backend: 'manifold',
          auxiliaryFiles: Object.keys(allAuxFiles).length > 0 ? allAuxFiles : undefined,
          libraryFiles: Object.keys(libraryFiles).length > 0 ? libraryFiles : undefined,
          libraryPaths: libraryPathsRef.current.length > 0 ? libraryPathsRef.current : undefined,
          inputPath: getProjectState().renderTargetPath ?? undefined,
          workingDir: workingDir || undefined,
        } as const;

        const cached = await renderServiceRef.current.getCached(code, renderOptions);
        // Only short-circuit on cached renders that actually contain displayable output.
        // Empty 3D results for 2D code still need to flow through the dimension-fallback path.
        if (cached && hasRenderableOutput(cached.output)) {
          cacheHit = true;
          setDimensionMode(resolvedDimension);
          setDiagnostics(cached.diagnostics);
          setPreviewKind(cached.kind);

          const mimeType = cached.kind === 'mesh' ? 'text/plain;charset=utf-8' : 'image/svg+xml';
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

        const result = await renderServiceRef.current.render(code, renderOptions);

        setDimensionMode(resolvedDimension);
        setDiagnostics(result.diagnostics);
        setPreviewKind(result.kind);

        // Revoke previous Blob URL to prevent memory leaks
        if (result.output.length > 0) {
          // Create Blob URL from output bytes
          const mimeType = result.kind === 'mesh' ? 'text/plain;charset=utf-8' : 'image/svg+xml';
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
              ...renderOptions,
              view: newDimension,
            });

            if (retryResult.output.length > 0) {
              // Opposite dimension worked — switch to it
              resolvedDimension = newDimension;
              switchedDimension = true;
              setDimensionMode(newDimension);
              setDiagnostics(retryResult.diagnostics);
              setPreviewKind(retryResult.kind);

              const mimeType =
                retryResult.kind === 'mesh' ? 'text/plain;charset=utf-8' : 'image/svg+xml';
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

  // Debounced auto-render on idle
  const autoRenderTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastRenderedSourceRef = useRef<string>(source);
  const lastRenderedVersionRef = useRef<number>(contentVersion);

  const markLatestRenderRequest = useCallback(
    (nextSource: string) => {
      lastRenderedSourceRef.current = nextSource;
      lastRenderedVersionRef.current = contentVersion;
    },
    [contentVersion]
  );

  /**
   * Render specific code immediately, bypassing debounce.
   * Use this when you have the code in hand and can't wait for the prop to update
   * (e.g., file open, AI edits, history restore).
   */
  const renderCode = useCallback(
    (code: string, trigger: RenderTrigger = 'code_update') => {
      markLatestRenderRequest(code);
      return doRender(code, dimensionMode, trigger);
    },
    [dimensionMode, doRender, markLatestRenderRequest]
  );

  // Initial render when WASM is ready
  useEffect(() => {
    if (!suppressInitialRender && ready && source) {
      markLatestRenderRequest(source);
      void doRender(source, dimensionMode, 'initial');
    }
  }, [dimensionMode, doRender, markLatestRenderRequest, ready, source, suppressInitialRender]);

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

  // Manual render function (stable callback)
  const manualRender = useCallback(() => {
    markLatestRenderRequest(source);
    return doRender(source, dimensionMode, 'manual');
  }, [source, dimensionMode, doRender, markLatestRenderRequest]);

  // Render on save function (stable callback)
  const renderOnSave = useCallback(() => {
    markLatestRenderRequest(source);
    return doRender(source, dimensionMode, 'save');
  }, [source, dimensionMode, doRender, markLatestRenderRequest]);

  const renderWithTrigger = useCallback(
    (trigger: RenderTrigger) => {
      markLatestRenderRequest(source);
      return doRender(source, dimensionMode, trigger);
    },
    [dimensionMode, doRender, markLatestRenderRequest, source]
  );

  // contentVersion changes when ANY project file is mutated (including non-render-target
  // includes). Together with source, this ensures the debounced auto-render fires for
  // both render-target edits and dependency edits.
  useEffect(() => {
    if (!autoRenderOnIdle || !ready) return;
    // Skip if source AND version haven't changed since the last render.
    if (
      source === lastRenderedSourceRef.current &&
      contentVersion === lastRenderedVersionRef.current
    )
      return;

    if (autoRenderTimerRef.current) {
      clearTimeout(autoRenderTimerRef.current);
    }

    autoRenderTimerRef.current = setTimeout(() => {
      lastRenderedSourceRef.current = source;
      lastRenderedVersionRef.current = contentVersion;
      void doRender(source, dimensionMode, 'auto_idle');
    }, autoRenderDelayMs);

    return () => {
      if (autoRenderTimerRef.current) {
        clearTimeout(autoRenderTimerRef.current);
      }
    };
  }, [source, contentVersion, autoRenderOnIdle, autoRenderDelayMs, ready, doRender, dimensionMode]);

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
        renderCode,
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
  }, [dimensionMode, doRender, isDevRuntime, manualRender, renderCode, renderWithTrigger]);

  return {
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
    renderCode,
    clearPreview,
    auxiliaryFiles,
  };
}
