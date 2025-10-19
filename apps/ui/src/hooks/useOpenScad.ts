import { useState, useEffect, useCallback } from 'react';
import { renderPreview, locateOpenScad, updateEditorState, updateOpenscadPath, getDiagnostics, type Diagnostic, type RenderPreviewResponse, type RenderKind } from '../api/tauri';
import { convertFileSrc } from '@tauri-apps/api/core';

export function useOpenScad(workingDir?: string | null) {
  const [source, setSource] = useState<string>('// Type your OpenSCAD code here\ncube([10, 10, 10]);');
  const [openscadPath, setOpenscadPath] = useState<string>('');
  const [previewSrc, setPreviewSrc] = useState<string>('');
  const [previewKind, setPreviewKind] = useState<RenderKind>('mesh');
  const [diagnostics, setDiagnostics] = useState<Diagnostic[]>([]);
  const [isRendering, setIsRendering] = useState(false);
  const [error, setError] = useState<string>('');
  const [dimensionMode, setDimensionMode] = useState<'2d' | '3d'>('3d');

  // Locate OpenSCAD on mount
  useEffect(() => {
    locateOpenScad({})
      .then(response => {
        setOpenscadPath(response.exe_path);
        console.log('Found OpenSCAD at:', response.exe_path);
        // Sync with backend state for AI agent
        updateOpenscadPath(response.exe_path).catch(err => {
          console.error('Failed to update openscad path in backend:', err);
        });
      })
      .catch(err => {
        setError(`Failed to locate OpenSCAD: ${err}`);
        console.error('OpenSCAD location error:', err);
      });
  }, []);

  const doRender = useCallback(async (code: string, useMesh = true, dimension: '2d' | '3d' = '3d') => {
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
        render_mesh: dimension === '3d', // Always use mesh for 3D mode
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

      // Fetch diagnostics from backend EditorState (errors may have been stored there)
      try {
        const diagnosticsFromBackend = await getDiagnostics();
        if (diagnosticsFromBackend.length > 0) {
          setDiagnostics(diagnosticsFromBackend);
        }
      } catch (diagErr) {
        console.error('[doRender] Failed to fetch diagnostics:', diagErr);
      }

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
            render_mesh: newDimension === '3d', // Always use mesh for 3D mode
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


  const updateSource = useCallback((newSource: string) => {
    console.log('[useOpenScad] updateSource called with new code length:', newSource.length);
    setSource(newSource);
    // Sync with backend EditorState for AI agent
    updateEditorState(newSource).catch(err => {
      console.error('Failed to update editor state:', err);
    });
    // No auto-render - only render on save or manual render button press
  }, []);

  // Initial render when OpenSCAD path is found
  useEffect(() => {
    if (openscadPath && source) {
      doRender(source, true); // Default to mesh rendering
    }
  }, [openscadPath]); // eslint-disable-line react-hooks/exhaustive-deps

  // Function to clear preview (for when opening new files)
  const clearPreview = useCallback(() => {
    setPreviewSrc('');
    setDiagnostics([]);
    setError('');
  }, []);

  // Manual render function (stable callback)
  const manualRender = useCallback(() => {
    console.log('[useOpenScad] manualRender called', { sourceLength: source.length, dimensionMode });
    doRender(source, true, dimensionMode);
  }, [source, dimensionMode, doRender]);

  // Render on save function (stable callback)
  const renderOnSave = useCallback(() => {
    doRender(source, true, dimensionMode);
  }, [source, dimensionMode, doRender]);

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
    dimensionMode,
    manualRender,
    renderOnSave,
    clearPreview,
  };
}
