import { ThreeViewer } from './ThreeViewer';
import { SvgViewer } from './SvgViewer';
import type { RenderKind } from '../api/tauri';

interface PreviewProps {
  src: string;
  kind: RenderKind;
  isRendering: boolean;
  error?: string;
}

export function Preview({ src, kind, isRendering, error }: PreviewProps) {
  console.log('[Preview] Render:', { src: src?.substring(0, 80), kind, isRendering, hasError: !!error });

  // Always show error first if present
  if (error) {
    console.log('[Preview] Showing error:', error.substring(0, 100));
    return (
      <div className="h-full bg-gray-900 flex items-center justify-center">
        <div className="text-red-400 px-4 py-2 bg-red-900/20 rounded border border-red-800 max-w-2xl">
          <p className="font-semibold">Render Error</p>
          <p className="text-sm mt-1 whitespace-pre-wrap">{error}</p>
        </div>
      </div>
    );
  }

  if (isRendering) {
    console.log('[Preview] Showing rendering state');
    return (
      <div className="h-full bg-gray-900 flex items-center justify-center">
        <div className="text-gray-400">
          <div className="animate-spin h-8 w-8 border-4 border-gray-600 border-t-blue-500 rounded-full mx-auto mb-2"></div>
          <p>Rendering...</p>
        </div>
      </div>
    );
  }

  // Don't render anything if no src
  if (!src) {
    console.log('[Preview] No src, showing placeholder');
    return (
      <div className="h-full bg-gray-900 flex items-center justify-center">
        <p className="text-gray-500">No preview available</p>
      </div>
    );
  }

  // For mesh, fill entire container
  if (kind === 'mesh') {
    return (
      <div className="w-full h-full">
        <ThreeViewer stlPath={src} />
      </div>
    );
  }

  // For SVG (2D mode), use SVG viewer with pan/zoom
  if (kind === 'svg') {
    return (
      <div className="w-full h-full">
        <SvgViewer src={src} />
      </div>
    );
  }

  // Should never reach here - 3D should always be mesh, 2D should always be SVG
  console.error('[Preview] Unexpected render kind:', kind);
  return (
    <div className="h-full bg-gray-900 flex items-center justify-center">
      <p className="text-red-400">Unexpected render format: {kind}</p>
    </div>
  );
}
