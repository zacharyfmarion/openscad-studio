import { useState, useCallback } from 'react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { ThreeViewer } from './ThreeViewer';
import { SvgViewer } from './SvgViewer';
import { CustomizerPanel } from './CustomizerPanel';
import { TbAdjustments, TbX } from 'react-icons/tb';
import type { RenderKind } from '../api/tauri';
import { loadSettings, updateSetting } from '../stores/settingsStore';

interface PreviewProps {
  src: string;
  kind: RenderKind;
  isRendering: boolean;
  error?: string;
  code: string;
  onCodeChange: (code: string) => void;
}

export function Preview({ src, kind, isRendering, error, code, onCodeChange }: PreviewProps) {
  const [showCustomizer, setShowCustomizer] = useState(false);
  const settings = loadSettings();

  // Calculate default size as percentage of container (assuming 1920px typical width)
  // This is approximate - panels will use actual pixel measurements
  const defaultCustomizerSize = (settings.ui.customizerWidth / 1920) * 100;

  const handlePanelResize = useCallback((sizes: number[]) => {
    if (sizes.length === 2 && showCustomizer) {
      // sizes[1] is the customizer panel size as percentage
      // Convert to approximate pixel width (assuming 1920px container)
      const pixelWidth = Math.round((sizes[1] / 100) * 1920);
      // Clamp between min and max
      const clampedWidth = Math.max(350, Math.min(900, pixelWidth));

      // Only update if significantly different (avoid spam)
      if (Math.abs(settings.ui.customizerWidth - clampedWidth) > 5) {
        updateSetting('ui', { customizerWidth: clampedWidth });
      }
    }
  }, [showCustomizer, settings.ui.customizerWidth]);

  console.log('[Preview] Render:', { src: src?.substring(0, 80), kind, isRendering, hasError: !!error });

  // Always show error first if present
  if (error) {
    console.log('[Preview] Showing error:', error.substring(0, 100));
    return (
      <div className="h-full flex items-center justify-center" style={{ backgroundColor: 'var(--bg-primary)' }}>
        <div className="px-4 py-2 rounded border max-w-2xl" style={{
          color: 'var(--color-error)',
          backgroundColor: 'rgba(220, 50, 47, 0.2)',
          borderColor: 'var(--color-error)'
        }}>
          <p className="font-semibold">Render Error</p>
          <p className="text-sm mt-1 whitespace-pre-wrap">{error}</p>
        </div>
      </div>
    );
  }

  if (isRendering) {
    console.log('[Preview] Showing rendering state');
    return (
      <div className="h-full flex items-center justify-center" style={{ backgroundColor: 'var(--bg-primary)' }}>
        <div style={{ color: 'var(--text-secondary)' }}>
          <div
            className="animate-spin h-8 w-8 border-4 rounded-full mx-auto mb-2"
            style={{
              borderColor: 'var(--border-primary)',
              borderTopColor: 'var(--accent-primary)'
            }}
          />
          <p>Rendering...</p>
        </div>
      </div>
    );
  }

  // Don't render anything if no src
  if (!src) {
    console.log('[Preview] No src, showing placeholder');
    return (
      <div className="h-full flex items-center justify-center" style={{ backgroundColor: 'var(--bg-primary)' }}>
        <p style={{ color: 'var(--text-tertiary)' }}>No preview available</p>
      </div>
    );
  }

  // Render the preview content
  let previewContent;
  if (kind === 'mesh') {
    previewContent = <ThreeViewer stlPath={src} />;
  } else if (kind === 'svg') {
    previewContent = <SvgViewer src={src} />;
  } else {
    console.error('[Preview] Unexpected render kind:', kind);
    previewContent = (
      <div className="h-full flex items-center justify-center" style={{ backgroundColor: 'var(--bg-primary)' }}>
        <p style={{ color: 'var(--color-error)' }}>Unexpected render format: {kind}</p>
      </div>
    );
  }

  if (!showCustomizer) {
    // Simple single-panel view when customizer is closed
    return (
      <div className="w-full h-full relative">
        {previewContent}

        {/* Customizer toggle button - positioned below viewer controls */}
        <button
          onClick={() => setShowCustomizer(true)}
          className="absolute top-14 right-2 p-2 rounded-md shadow-lg"
          style={{
            backgroundColor: 'var(--bg-elevated)',
            borderColor: 'var(--border-secondary)',
            color: 'var(--text-secondary)',
            border: '1px solid',
            transition: 'background-color 200ms, color 200ms',
          }}
          title="Toggle Customizer"
        >
          <TbAdjustments size={18} />
        </button>
      </div>
    );
  }

  // Resizable panel view when customizer is open
  return (
    <PanelGroup direction="horizontal" onLayout={handlePanelResize}>
      {/* Preview panel */}
      <Panel defaultSize={100 - defaultCustomizerSize} minSize={30}>
        <div className="h-full relative">
          {previewContent}

          {/* Customizer toggle button - fades out when open */}
          <button
            onClick={() => setShowCustomizer(false)}
            className="absolute top-14 right-2 p-2 rounded-md shadow-lg"
            style={{
              backgroundColor: 'var(--bg-tertiary)',
              borderColor: 'var(--border-secondary)',
              color: 'var(--text-inverse)',
              border: '1px solid',
              opacity: 0,
              pointerEvents: 'none',
              transition: 'opacity 300ms ease-in-out, background-color 200ms, color 200ms',
            }}
            title="Toggle Customizer"
          >
            <TbAdjustments size={18} />
          </button>
        </div>
      </Panel>

      {/* Resize handle */}
      <PanelResizeHandle className="w-1 transition-colors hover:w-1.5" style={{ backgroundColor: 'var(--border-primary)' }} />

      {/* Customizer panel */}
      <Panel defaultSize={defaultCustomizerSize} minSize={18} maxSize={50}>
        <div
          className="h-full shadow-2xl"
          style={{
            backgroundColor: 'var(--bg-secondary)',
            borderLeft: '1px solid var(--border-primary)',
          }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: 'var(--border-primary)' }}>
            <h3 className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
              Customizer
            </h3>
            <button
              onClick={() => setShowCustomizer(false)}
              className="p-1 rounded hover:bg-opacity-80 transition-colors"
              style={{ color: 'var(--text-secondary)' }}
              title="Close Customizer"
            >
              <TbX size={18} />
            </button>
          </div>

          {/* Customizer content */}
          <div className="h-[calc(100%-52px)] overflow-hidden">
            <CustomizerPanel code={code} onChange={onCodeChange} />
          </div>
        </div>
      </Panel>
    </PanelGroup>
  );
}
