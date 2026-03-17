import { VIEWER_TOOLS } from './viewerToolRegistry';
import type { InteractionMode, LoadedPreviewModel } from './types';

interface ViewerToolPaletteProps {
  mode: InteractionMode;
  onModeChange: (mode: InteractionMode) => void;
  loadedModel: LoadedPreviewModel | null;
}

export function ViewerToolPalette({ mode, onModeChange, loadedModel }: ViewerToolPaletteProps) {
  return (
    <div
      className="flex flex-col shrink-0"
      style={{
        width: '40px',
        borderRight: '1px solid var(--border-primary)',
      }}
      data-testid="preview-tool-palette"
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
    >
      {VIEWER_TOOLS.map((tool) => {
        const isActive = mode === tool.id;
        const isDisabled = tool.id !== 'orbit' && !loadedModel;
        const Icon = tool.icon;
        const shortcutLabel = tool.shortcut ? ` (${tool.shortcut})` : '';

        return (
          <button
            key={tool.id}
            type="button"
            title={`${tool.label}${shortcutLabel}`}
            aria-label={`${tool.label}${shortcutLabel}`}
            disabled={isDisabled}
            onClick={() => onModeChange(tool.id)}
            data-testid={`preview-toggle-${tool.id === 'orbit' ? 'orbit' : tool.id === 'measure-distance' ? 'measure' : tool.id === 'measure-bbox' ? 'bbox' : 'section'}`}
            style={{
              width: '40px',
              height: '40px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: isActive ? 'var(--bg-secondary)' : 'transparent',
              color: isActive ? 'var(--accent-primary)' : 'var(--text-secondary)',
              opacity: isDisabled ? 0.4 : 1,
              border: 'none',
              borderBottom: '1px solid var(--border-primary)',
              cursor: isDisabled ? 'not-allowed' : 'pointer',
              transition: 'background-color 0.15s, color 0.15s',
            }}
          >
            <Icon size={18} />
          </button>
        );
      })}
    </div>
  );
}
