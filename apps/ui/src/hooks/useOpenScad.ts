import { useState, useEffect, useCallback, useRef } from 'react';
import { renderPreview, locateOpenScad, type Diagnostic, type RenderPreviewResponse, type RenderKind } from '../api/tauri';
import { convertFileSrc } from '@tauri-apps/api/core';

export function useOpenScad(workingDir?: string | null) {
  const [source, setSource] = useState<string>('// Type your OpenSCAD code here\ncube([10, 10, 10]);');
  const [openscadPath, setOpenscadPath] = useState<string>('');
  const [previewSrc, setPreviewSrc] = useState<string>('');
  const [previewKind, setPreviewKind] = useState<RenderKind>('mesh');
  const [diagnostics, setDiagnostics] = useState<Diagnostic[]>([]);
  const [isRendering, setIsRendering] = useState(false);
  const [error, setError] = useState<string>('');
  const [viewMode, setViewMode] = useState<'fast' | 'interactive'>('interactive');
  const [dimensionMode, setDimensionMode] = useState<'2d' | '3d'>('3d');
  const debounceTimerRef = useRef<number>();

  // Locate OpenSCAD on mount
  useEffect(() => {
    locateOpenScad({})
      .then(response => {
        setOpenscadPath(response.exe_path);
        console.log('Found OpenSCAD at:', response.exe_path);
      })
      .catch(err => {
        setError(`Failed to locate OpenSCAD: ${err}`);
        console.error('OpenSCAD location error:', err);
      });
  }, []);

  const doRender = useCallback(async (code: string, useMesh = false, dimension: '2d' | '3d' = '3d') => {
    console.log('[doRender] Starting render:', { dimension, useMesh, codeLength: code.length });

    if (!openscadPath) {
      setError('OpenSCAD path not set');
      return;
    }

    setIsRendering(true);
    setError('');
    setPreviewSrc(''); // Clear preview immediately when starting new render

    try {
      console.log('[doRender] Calling renderPreview...');
      const result: RenderPreviewResponse = await renderPreview(openscadPath, {
        source: code,
        view: dimension,
        size: { w: 800, h: 600 },
        render_mesh: useMesh && dimension === '3d', // Only use mesh for 3D mode
        working_dir: workingDir || undefined,
      });

      console.log('[doRender] Render success:', { kind: result.kind, path: result.path, diagnostics: result.diagnostics.length });
      setDiagnostics(result.diagnostics);
      setPreviewKind(result.kind);

      // Convert file path to asset URL that Tauri can serve
      // Add timestamp to bust browser cache
      const assetUrl = convertFileSrc(result.path);
      const cacheBustedUrl = `${assetUrl}?t=${Date.now()}`;
      console.log('[doRender] Setting preview src:', cacheBustedUrl);
      setPreviewSrc(cacheBustedUrl);
    } catch (err) {
      const errorMsg = typeof err === 'string' ? err : String(err);
      console.log('[doRender] Render error:', errorMsg);

      // Check if error is due to dimension mismatch and auto-retry with opposite mode
      const is2DObjectIn3DMode = errorMsg.includes('2D object') && errorMsg.includes('3D mode');
      const is3DObjectIn2DMode = errorMsg.includes('3D object') && errorMsg.includes('2D mode');

      if (is2DObjectIn3DMode || is3DObjectIn2DMode) {
        const newDimension = dimension === '2d' ? '3d' : '2d';
        console.log(`[doRender] Auto-switching from ${dimension} to ${newDimension} mode`);

        // Update dimension mode
        setDimensionMode(newDimension);

        // Retry render with new dimension
        try {
          const retryResult: RenderPreviewResponse = await renderPreview(openscadPath, {
            source: code,
            view: newDimension,
            size: { w: 800, h: 600 },
            render_mesh: useMesh && newDimension === '3d',
            working_dir: workingDir || undefined,
          });

          console.log('[doRender] Auto-retry success:', { kind: retryResult.kind, path: retryResult.path });
          setDiagnostics(retryResult.diagnostics);
          setPreviewKind(retryResult.kind);

          const assetUrl = convertFileSrc(retryResult.path);
          const cacheBustedUrl = `${assetUrl}?t=${Date.now()}`;
          setPreviewSrc(cacheBustedUrl);
          setError(''); // Clear error on successful retry
        } catch (retryErr) {
          // Both modes failed - show error
          const retryErrorMsg = typeof retryErr === 'string' ? retryErr : String(retryErr);
          console.log('[doRender] Auto-retry also failed:', retryErrorMsg);
          setError(`Failed to render in both 2D and 3D modes.\n\nOriginal error: ${errorMsg}\n\nRetry error: ${retryErrorMsg}`);
          setPreviewSrc('');
        }
      } else {
        // Not a dimension mismatch error - just show it
        setError(errorMsg);
        setPreviewSrc('');
      }

      console.error('Render error:', err);
    } finally {
      setIsRendering(false);
    }
  }, [openscadPath, workingDir, setDimensionMode]);

  // Toggle between 2D and 3D modes
  const toggleDimensionMode = useCallback(() => {
    const newMode = dimensionMode === '2d' ? '3d' : '2d';
    setDimensionMode(newMode);
    // For 2D mode, always use SVG (no mesh)
    // For 3D mode, use current viewMode setting
    doRender(source, newMode === '3d' && viewMode === 'interactive', newMode);
  }, [dimensionMode, source, viewMode, doRender]);

  const updateSource = useCallback((newSource: string) => {
    setSource(newSource);

    // Clear existing timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    // Debounce render (300ms) - use current view mode and dimension for auto-updates
    debounceTimerRef.current = window.setTimeout(() => {
      doRender(newSource, dimensionMode === '3d' && viewMode === 'interactive', dimensionMode);
    }, 300);
  }, [doRender, viewMode, dimensionMode]);

  // Toggle between fast (PNG) and interactive (STL) modes (only for 3D)
  const toggleViewMode = useCallback(() => {
    if (dimensionMode === '2d') return; // No effect in 2D mode
    const newMode = viewMode === 'fast' ? 'interactive' : 'fast';
    setViewMode(newMode);
    doRender(source, newMode === 'interactive', '3d');
  }, [viewMode, source, dimensionMode, doRender]);

  // Initial render when OpenSCAD path is found
  useEffect(() => {
    if (openscadPath && source) {
      doRender(source, true); // Default to mesh rendering
    }
  }, [openscadPath]); // Only run when openscadPath is set

  return {
    source,
    updateSource,
    previewSrc,
    previewKind,
    diagnostics,
    isRendering,
    error,
    openscadPath,
    setOpenscadPath,
    viewMode,
    toggleViewMode,
    dimensionMode,
    toggleDimensionMode,
    manualRender: () => doRender(source, dimensionMode === '3d' && viewMode === 'interactive', dimensionMode),
  };
}
