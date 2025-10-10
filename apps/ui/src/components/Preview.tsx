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
  if (error) {
    return (
      <div className="h-full bg-gray-900 flex items-center justify-center">
        <div className="text-red-400 px-4 py-2 bg-red-900/20 rounded border border-red-800">
          <p className="font-semibold">Render Error</p>
          <p className="text-sm mt-1">{error}</p>
        </div>
      </div>
    );
  }

  if (isRendering) {
    return (
      <div className="h-full bg-gray-900 flex items-center justify-center">
        <div className="text-gray-400">
          <div className="animate-spin h-8 w-8 border-4 border-gray-600 border-t-blue-500 rounded-full mx-auto mb-2"></div>
          <p>Rendering...</p>
        </div>
      </div>
    );
  }

  if (!src) {
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

  // For SVG, use SVG viewer with pan/zoom
  if (kind === 'svg') {
    return (
      <div className="w-full h-full">
        <SvgViewer src={src} />
      </div>
    );
  }

  // For PNG images, center them
  return (
    <div className="h-full bg-gray-900 flex items-center justify-center">
      <img
        src={src}
        alt="OpenSCAD Preview"
        className="max-w-full max-h-full object-contain"
        key={src} // Force re-render when src changes
      />
    </div>
  );
}
