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
      className="absolute left-2 top-2 z-20 flex flex-col items-center"
      style={{
        gap: '6px',
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
            variant="toolbar"
            title={`${tool.label}${shortcutLabel}`}
            tooltipSide="right"
            aria-label={`${tool.label}${shortcutLabel}`}
            disabled={isDisabled}
            isActive={isActive}
            onClick={() => onModeChange(tool.id)}
            data-testid={`preview-toggle-${
              tool.id === 'orbit'
                ? 'orbit'
                : tool.id === 'measure-distance'
                  ? 'measure'
                  : tool.id === 'measure-bbox'
                    ? 'bbox'
                    : tool.id === 'section-plane'
                      ? 'section'
                      : 'annotate'
            }`}
          >
            <Icon size={17} />
          </IconButton>
        );
      })}
    </div>
  );
}
