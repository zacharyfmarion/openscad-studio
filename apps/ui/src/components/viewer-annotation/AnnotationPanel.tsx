import {
  TbArrowBackUp,
  TbBrush,
  TbCircle,
  TbLink,
  TbSettings,
  TbSquare,
  TbTrash,
  TbX,
} from 'react-icons/tb';
import { Button, IconButton } from '../ui';
import type { AnnotationTool } from './types';

interface AnnotationPanelProps {
  tool: AnnotationTool;
  onToolChange: (tool: AnnotationTool) => void;
  onUndo: () => void;
  onClear: () => void;
  onCancel: () => void;
  onAttach: () => void | Promise<void>;
  canUndo: boolean;
  canClear: boolean;
  canAttach: boolean;
  attachLabel?: string;
}

const TOOLS: Array<{
  id: AnnotationTool;
  label: string;
  icon: typeof TbSquare;
}> = [
  { id: 'box', label: 'Box', icon: TbSquare },
  { id: 'oval', label: 'Oval', icon: TbCircle },
  { id: 'freehand', label: 'Freehand', icon: TbBrush },
];

function ToolbarDivider() {
  return (
    <div
      aria-hidden="true"
      className="h-6 w-px shrink-0"
      style={{ backgroundColor: 'var(--border-primary)' }}
    />
  );
}

export function AnnotationPanel({
  tool,
  onToolChange,
  onUndo,
  onClear,
  onCancel,
  onAttach,
  canUndo,
  canClear,
  canAttach,
  attachLabel = 'Attach to AI',
}: AnnotationPanelProps) {
  const AttachIcon = attachLabel === 'Add API Key' ? TbSettings : TbLink;

  return (
    <div
      className="absolute bottom-3 left-1/2 z-40 -translate-x-1/2"
      data-testid="viewer-annotation-panel"
    >
      <div
        className="flex items-center gap-2 rounded-xl px-3 py-2 shadow-lg"
        style={{
          backgroundColor: 'color-mix(in srgb, var(--bg-elevated) 94%, transparent)',
          border: '1px solid var(--border-primary)',
          backdropFilter: 'blur(12px)',
        }}
      >
        {TOOLS.map((entry) => {
          const Icon = entry.icon;
          const active = tool === entry.id;
          return (
            <IconButton
              key={entry.id}
              variant="toolbar"
              size="md"
              isActive={active}
              onClick={() => onToolChange(entry.id)}
              title={entry.label}
              tooltipSide="top"
              aria-label={entry.label}
              data-testid={`viewer-annotation-tool-${entry.id}`}
            >
              <Icon size={16} />
            </IconButton>
          );
        })}

        <ToolbarDivider />

        <IconButton
          variant="toolbar"
          size="md"
          onClick={onUndo}
          disabled={!canUndo}
          title="Undo"
          tooltipSide="top"
          aria-label="Undo"
          data-testid="viewer-annotation-undo"
        >
          <TbArrowBackUp size={16} />
        </IconButton>

        <IconButton
          variant="toolbar"
          size="md"
          onClick={onClear}
          disabled={!canClear}
          title="Clear"
          tooltipSide="top"
          aria-label="Clear annotations"
          data-testid="viewer-annotation-clear"
        >
          <TbTrash size={16} />
        </IconButton>

        <ToolbarDivider />

        <Button
          type="button"
          variant="primary"
          size="sm"
          onClick={() => {
            void onAttach();
          }}
          disabled={!canAttach}
          data-testid="viewer-annotation-attach"
          className="gap-2 whitespace-nowrap px-3"
        >
          <AttachIcon size={16} />
          <span>{attachLabel}</span>
        </Button>

        <IconButton
          variant="toolbar"
          size="md"
          onClick={onCancel}
          title="Cancel"
          tooltipSide="top"
          aria-label="Cancel annotation mode"
          data-testid="viewer-annotation-cancel"
        >
          <TbX size={16} />
        </IconButton>
      </div>
    </div>
  );
}
