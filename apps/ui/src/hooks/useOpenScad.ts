import { useState, useEffect, useCallback, useRef } from 'react';
import { renderPreview, locateOpenScad, type Diagnostic, type RenderPreviewResponse, type RenderKind } from '../api/tauri';
import { convertFileSrc } from '@tauri-apps/api/core';

export function useOpenScad() {
  const [source, setSource] = useState<string>('// Type your OpenSCAD code here\ncube([10, 10, 10]);');
  const [openscadPath, setOpenscadPath] = useState<string>('');
  const [previewSrc, setPreviewSrc] = useState<string>('');
  const [previewKind, setPreviewKind] = useState<RenderKind>('mesh');
  const [diagnostics, setDiagnostics] = useState<Diagnostic[]>([]);
  const [isRendering, setIsRendering] = useState(false);
  const [error, setError] = useState<string>('');
  const [viewMode, setViewMode] = useState<'fast' | 'interactive'>('interactive');
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

  const doRender = useCallback(async (code: string, useMesh = false) => {
    if (!openscadPath) {
      setError('OpenSCAD path not set');
      return;
    }

    setIsRendering(true);
    setError('');

    try {
      const result: RenderPreviewResponse = await renderPreview(openscadPath, {
        source: code,
        view: '3d',
        size: { w: 800, h: 600 },
        render_mesh: useMesh,
      });

      setDiagnostics(result.diagnostics);
      setPreviewKind(result.kind);

      // Convert file path to asset URL that Tauri can serve
      // Add timestamp to bust browser cache
      const assetUrl = convertFileSrc(result.path);
      const cacheBustedUrl = `${assetUrl}?t=${Date.now()}`;
      setPreviewSrc(cacheBustedUrl);
    } catch (err) {
      const errorMsg = typeof err === 'string' ? err : String(err);
      setError(errorMsg);
      console.error('Render error:', err);
    } finally {
      setIsRendering(false);
    }
  }, [openscadPath]);

  const updateSource = useCallback((newSource: string) => {
    setSource(newSource);

    // Clear existing timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    // Debounce render (300ms) - use current view mode for auto-updates
    debounceTimerRef.current = window.setTimeout(() => {
      doRender(newSource, viewMode === 'interactive');
    }, 300);
  }, [doRender, viewMode]);

  // Toggle between fast (PNG) and interactive (STL) modes
  const toggleViewMode = useCallback(() => {
    const newMode = viewMode === 'fast' ? 'interactive' : 'fast';
    setViewMode(newMode);
    doRender(source, newMode === 'interactive');
  }, [viewMode, source, doRender]);

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
    manualRender: () => doRender(source, viewMode === 'interactive'),
  };
}
