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
      className="flex flex-col shrink-0 items-center"
      style={{
        width: '44px',
        padding: '6px 0',
        gap: '2px',
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
          // eslint-disable-next-line no-restricted-syntax -- palette tool buttons carry a full set of imperative inline styles (size, color, border, cursor, opacity) driven by active+disabled state; <IconButton> doesn't expose these overrides without full className fights
          <button
            key={tool.id}
            type="button"
            title={`${tool.label}${shortcutLabel}`}
            aria-label={`${tool.label}${shortcutLabel}`}
            disabled={isDisabled}
            onClick={() => onModeChange(tool.id)}
            data-testid={`preview-toggle-${tool.id === 'orbit' ? 'orbit' : tool.id === 'measure-distance' ? 'measure' : tool.id === 'measure-bbox' ? 'bbox' : 'section'}`}
            style={{
              width: '32px',
              height: '32px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: isActive ? 'var(--bg-tertiary, var(--bg-elevated))' : 'transparent',
              color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
              opacity: isDisabled ? 0.35 : 1,
              border: isActive ? '1px solid var(--border-primary)' : '1px solid transparent',
              borderRadius: 'var(--radius-md)',
              cursor: isDisabled ? 'not-allowed' : 'pointer',
              transition: 'background-color 0.15s, color 0.15s, border-color 0.15s',
              flexShrink: 0,
            }}
          >
            <Icon size={17} />
          </button>
        );
      })}
    </div>
  );
}
