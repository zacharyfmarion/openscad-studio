import { useState, useEffect, useCallback, useRef } from 'react';
import { RenderService, type Diagnostic } from '../services/renderService';
import { getPlatform } from '../platform';
import type { LibrarySettings } from '../stores/settingsStore';
import { resolveWorkingDirDeps } from '../utils/resolveWorkingDirDeps';
export type RenderKind = 'mesh' | 'svg';

interface UseOpenScadOptions {
  workingDir?: string | null;
  autoRenderOnIdle?: boolean;
  autoRenderDelayMs?: number;
  library?: LibrarySettings;
}

export function useOpenScad(options: UseOpenScadOptions = {}) {
  const { autoRenderOnIdle = false, autoRenderDelayMs = 500, library } = options;
  const [source, setSource] = useState<string>(
    '// Type your OpenSCAD code here\ncube([10, 10, 10]);'
  );
  const [ready, setReady] = useState(false);
  const [previewSrc, setPreviewSrc] = useState<string>('');
  const [previewKind, setPreviewKind] = useState<RenderKind>('mesh');
  const [diagnostics, setDiagnostics] = useState<Diagnostic[]>([]);
  const [isRendering, setIsRendering] = useState(false);
  const [error, setError] = useState<string>('');
  const [dimensionMode, setDimensionMode] = useState<'2d' | '3d'>('3d');

  // Track Blob URLs for cleanup
  const prevBlobUrlRef = useRef<string>('');

  const renderServiceRef = useRef<RenderService>(RenderService.getInstance());
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
    const platform = getPlatform();

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
  }, [library?.autoDiscoverSystem, customPathsKey, mergeAndSetAuxFiles]); // eslint-disable-line react-hooks/exhaustive-deps

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
        console.error('[useOpenScad] WASM init error:', err);
      });
  }, []);

  const doRender = useCallback(
    async (code: string, dimension: '2d' | '3d' = '3d') => {
      if (!renderServiceRef.current) {
        setError('RenderService not available');
        return;
      }

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
        if (cached) {
          setDiagnostics(cached.diagnostics);
          setPreviewKind(cached.kind);

          if (prevBlobUrlRef.current) {
            URL.revokeObjectURL(prevBlobUrlRef.current);
          }

          if (cached.output.length > 0) {
            const mimeType = cached.kind === 'mesh' ? 'application/octet-stream' : 'image/svg+xml';
            const blob = new Blob([cached.output], { type: mimeType });
            const blobUrl = URL.createObjectURL(blob);
            prevBlobUrlRef.current = blobUrl;
            setPreviewSrc(blobUrl);
          }

          setIsRendering(false);
          return;
        }

        // Cache miss — wait for library files to finish loading
        await auxFilesPromiseRef.current;

        // Resolve working directory dependencies by parsing include/use statements
        // instead of blindly scanning the entire working directory
        const workingDir = workingDirRef.current;
        let renderAuxFiles = libraryFilesRef.current;

        if (workingDir) {
          const platform = getPlatform();
          const workingDirFiles = await resolveWorkingDirDeps(code, {
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

        setDiagnostics(result.diagnostics);
        setPreviewKind(result.kind);

        // Revoke previous Blob URL to prevent memory leaks
        if (prevBlobUrlRef.current) {
          URL.revokeObjectURL(prevBlobUrlRef.current);
        }

        if (result.output.length > 0) {
          // Create Blob URL from output bytes
          const mimeType = result.kind === 'mesh' ? 'application/octet-stream' : 'image/svg+xml';
          const blob = new Blob([result.output], { type: mimeType });
          const blobUrl = URL.createObjectURL(blob);
          prevBlobUrlRef.current = blobUrl;
          setPreviewSrc(blobUrl);
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
              setDimensionMode(newDimension);
              setDiagnostics(retryResult.diagnostics);
              setPreviewKind(retryResult.kind);

              const mimeType =
                retryResult.kind === 'mesh' ? 'application/octet-stream' : 'image/svg+xml';
              const blob = new Blob([retryResult.output], { type: mimeType });
              const blobUrl = URL.createObjectURL(blob);
              prevBlobUrlRef.current = blobUrl;
              setPreviewSrc(blobUrl);
            } else {
              // Neither dimension produced output
              setError('Render produced no output');
              setPreviewSrc('');
            }
          } else {
            // Has real errors (not dimension mismatch) — report them
            const errors = result.diagnostics.filter((d) => d.severity === 'error');
            setError(errors.map((e) => e.message).join('\n'));
            setPreviewSrc('');
          }
        }
      } catch (err) {
        const errorMsg = typeof err === 'string' ? err : String(err);
        setError(errorMsg);
        setPreviewSrc('');
        console.error('Render error:', err);
      } finally {
        setIsRendering(false);
      }
    },
    [mergeAndSetAuxFiles]
  );

  const updateSource = useCallback((newSource: string) => {
    setSource(newSource);
  }, []);

  // Atomically update source AND render with the new code.
  // This bypasses the stale-closure problem where manualRender() would
  // render with the previous `source` because React hasn't flushed the
  // state update from updateSource() yet.
  const updateSourceAndRender = useCallback(
    (newSource: string) => {
      setSource(newSource);
      lastRenderedSourceRef.current = newSource;
      doRender(newSource, dimensionMode);
    },
    [dimensionMode, doRender]
  );

  // Initial render when WASM is ready
  useEffect(() => {
    if (ready && source) {
      lastRenderedSourceRef.current = source;
      doRender(source, dimensionMode);
    }
  }, [ready]); // eslint-disable-line react-hooks/exhaustive-deps

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
    doRender(source, dimensionMode);
  }, [source, dimensionMode, doRender]);

  // Render on save function (stable callback)
  const renderOnSave = useCallback(() => {
    lastRenderedSourceRef.current = source;
    doRender(source, dimensionMode);
  }, [source, dimensionMode, doRender]);

  useEffect(() => {
    if (!autoRenderOnIdle || !ready) return;
    if (source === lastRenderedSourceRef.current) return;

    if (autoRenderTimerRef.current) {
      clearTimeout(autoRenderTimerRef.current);
    }

    autoRenderTimerRef.current = setTimeout(() => {
      lastRenderedSourceRef.current = source;
      doRender(source, dimensionMode);
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
    if (import.meta.env.DEV || window.__PLAYWRIGHT__) {
      window.__TEST_OPENSCAD__ = {
        doRender,
        manualRender,
        updateSourceAndRender,
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
  }, [doRender, manualRender, updateSourceAndRender, dimensionMode]);

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
    clearPreview,
    auxiliaryFiles,
  };
}
