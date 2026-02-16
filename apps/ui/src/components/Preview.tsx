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
  console.log('[Preview] Render:', {
    src: src?.substring(0, 80),
    kind,
    isRendering,
    hasError: !!error,
  });

  if (error) {
    return (
      <div
        className="w-full h-full flex items-center justify-center"
        style={{ backgroundColor: 'var(--bg-primary)' }}
      >
        <div
          className="px-4 py-2 rounded border max-w-2xl"
          style={{
            color: 'var(--color-error)',
            backgroundColor: 'rgba(220, 50, 47, 0.2)',
            borderColor: 'var(--color-error)',
          }}
        >
          <p className="font-semibold">Render Error</p>
          <p className="text-sm mt-1 whitespace-pre-wrap">{error}</p>
        </div>
      </div>
    );
  }

  if (!src && !isRendering) {
    return (
      <div
        className="w-full h-full flex items-center justify-center"
        style={{ backgroundColor: 'var(--bg-primary)' }}
      >
        <p style={{ color: 'var(--text-tertiary)' }}>No preview available</p>
      </div>
    );
  }

  if (kind === 'mesh') {
    return <ThreeViewer stlPath={src} isLoading={isRendering} />;
  }

  if (kind === 'svg') {
    return <SvgViewer src={src} />;
  }

  return (
    <div
      className="w-full h-full flex items-center justify-center"
      style={{ backgroundColor: 'var(--bg-primary)' }}
    >
      <p style={{ color: 'var(--color-error)' }}>Unexpected render format: {kind}</p>
    </div>
  );
}
