import { useState, useEffect, useCallback, useRef } from 'react';
import { RenderService, type Diagnostic } from '../services/renderService';
import { getPlatform } from '../platform';
import type { LibrarySettings } from '../stores/settingsStore';
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

  // Serialize customPaths for stable dependency comparison
  const customPathsKey = library?.customPaths.join('\0') ?? '';

  useEffect(() => {
    const platform = getPlatform();

    const loadAllFiles = async () => {
      const files: Record<string, string> = {};

      // 1. Read working directory files
      if (options.workingDir) {
        const workingDirFiles = await platform.readDirectoryFiles(options.workingDir);
        Object.assign(files, workingDirFiles);
      }

      // 2. Read library paths (auto-discovered + custom)
      if (library) {
        const systemPaths = library.autoDiscoverSystem
          ? await platform.getLibraryPaths()
          : [];
        const allLibPaths = [...systemPaths, ...library.customPaths];

        for (const libPath of allLibPaths) {
          try {
            const libFiles = await platform.readDirectoryFiles(libPath);
            const count = Object.keys(libFiles).length;
            console.log(`[useOpenScad] Loaded ${count} files from ${libPath}`);
            Object.assign(files, libFiles);
          } catch (err) {
            console.warn(`[useOpenScad] Failed to read library path ${libPath}:`, err);
          }
        }
      }

      console.log('[useOpenScad] Total auxiliary files:', Object.keys(files).length);
      auxiliaryFilesRef.current = files;
      setAuxiliaryFiles(files);
    };
    auxFilesPromiseRef.current = loadAllFiles();
  }, [options.workingDir, library?.autoDiscoverSystem, customPathsKey]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const doRender = useCallback(async (code: string, dimension: '2d' | '3d' = '3d') => {

    if (!renderServiceRef.current) {
      setError('RenderService not available');
      return;
    }

    setIsRendering(true);
    setError('');

    try {
      // Wait for auxiliary files to finish loading before rendering
      await auxFilesPromiseRef.current;

      const result = await renderServiceRef.current.render(code, {
        view: dimension,
        backend: 'manifold',
        auxiliaryFiles:
          Object.keys(auxiliaryFilesRef.current).length > 0 ? auxiliaryFilesRef.current : undefined,
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
  }, []);

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
