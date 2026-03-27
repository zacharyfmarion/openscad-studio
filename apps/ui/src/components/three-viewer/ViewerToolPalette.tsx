import { VIEWER_TOOLS } from './viewerToolRegistry';
import type { InteractionMode, LoadedPreviewModel } from './types';
import { IconButton } from '../ui';

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
          <IconButton
            key={tool.id}
            title={`${tool.label}${shortcutLabel}`}
            tooltipSide="right"
            aria-label={`${tool.label}${shortcutLabel}`}
            disabled={isDisabled}
            isActive={isActive}
            onClick={() => onModeChange(tool.id)}
            data-testid={`preview-toggle-${tool.id === 'orbit' ? 'orbit' : tool.id === 'measure-distance' ? 'measure' : tool.id === 'measure-bbox' ? 'bbox' : 'section'}`}
          >
            <Icon size={17} />
          </IconButton>
        );
      })}
    </div>
  );
}
