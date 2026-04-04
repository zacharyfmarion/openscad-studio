import { ThreeViewer } from './ThreeViewer';
import { SvgViewer } from './SvgViewer';
import { InlineErrorBoundary } from './ErrorBoundary';
import { Text } from './ui';
import type { RenderKind } from '../hooks/useOpenScad';
import type { ViewerAnnotationAttachResult } from './viewer-annotation';

interface PreviewProps {
  src: string;
  kind: RenderKind;
  isRendering: boolean;
  error?: string;
  viewerId?: string;
  onVisualReady?: () => void;
  hasCurrentModelApiKey: boolean;
  canAttachViewerAnnotation: boolean;
  onAttachViewerAnnotationFile: (file: File) => Promise<ViewerAnnotationAttachResult>;
}

export function Preview({
  src,
  kind,
  isRendering,
  error,
  viewerId,
  onVisualReady,
  hasCurrentModelApiKey,
  canAttachViewerAnnotation,
  onAttachViewerAnnotationFile,
}: PreviewProps) {
  if (import.meta.env.DEV) {
    console.log('[Preview] Render:', {
      src: src?.substring(0, 80),
      kind,
      isRendering,
      hasError: !!error,
    });
  }

  if (error) {
    return (
      <div
        data-testid="preview-error"
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
          <Text variant="body" weight="semibold" color="error">
            Render Error
          </Text>
          <Text variant="body" color="error" className="mt-1 whitespace-pre-wrap">
            {error}
          </Text>
        </div>
      </div>
    );
  }

  if (!src && !isRendering) {
    return (
      <div
        data-testid="preview-empty"
        className="w-full h-full flex items-center justify-center"
        style={{ backgroundColor: 'var(--bg-primary)' }}
      >
        <Text variant="body" color="tertiary">
          No preview available
        </Text>
      </div>
    );
  }

  if (kind === 'mesh') {
    return (
      <InlineErrorBoundary fallbackMessage="3D preview failed to render (WebGL error)">
        <ThreeViewer
          preview3dPath={src}
          isLoading={isRendering}
          viewerId={viewerId}
          onVisualReady={onVisualReady}
          hasCurrentModelApiKey={hasCurrentModelApiKey}
          canAttachToAi={canAttachViewerAnnotation}
          onAttachToAi={onAttachViewerAnnotationFile}
        />
      </InlineErrorBoundary>
    );
  }

  if (kind === 'svg') {
    return (
      <SvgViewer
        key={src}
        src={src}
        viewerId={viewerId}
        onVisualReady={onVisualReady}
        hasCurrentModelApiKey={hasCurrentModelApiKey}
        canAttachToAi={canAttachViewerAnnotation}
        onAttachToAi={onAttachViewerAnnotationFile}
      />
    );
  }

  return (
    <div
      className="w-full h-full flex items-center justify-center"
      style={{ backgroundColor: 'var(--bg-primary)' }}
    >
      <Text variant="body" color="error">
        Unexpected render format: {kind}
      </Text>
    </div>
  );
}
