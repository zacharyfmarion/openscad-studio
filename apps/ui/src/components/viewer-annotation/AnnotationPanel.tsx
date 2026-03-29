import { TbBrush, TbCircle, TbSquare, TbTrash, TbArrowBackUp, TbLink } from 'react-icons/tb';
import { Button } from '../ui';
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
  return (
    <div className="flex flex-col gap-3" data-testid="viewer-annotation-panel">
      <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>
        Draw over the current preview, then attach the snapshot to chat.
      </div>

      <div className="grid grid-cols-3 gap-2">
        {TOOLS.map((entry) => {
          const Icon = entry.icon;
          const active = tool === entry.id;
          return (
            <Button
              key={entry.id}
              type="button"
              onClick={() => onToolChange(entry.id)}
              data-testid={`viewer-annotation-tool-${entry.id}`}
              variant="secondary"
              size="sm"
              isActive={active}
              className="gap-2 text-xs"
            >
              <Icon size={14} />
              <span>{entry.label}</span>
            </Button>
          );
        })}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Button
          type="button"
          variant="secondary"
          onClick={onUndo}
          disabled={!canUndo}
          data-testid="viewer-annotation-undo"
        >
          <TbArrowBackUp size={14} />
          Undo
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={onClear}
          disabled={!canClear}
          data-testid="viewer-annotation-clear"
        >
          <TbTrash size={14} />
          Clear
        </Button>
      </div>

      <Button
        type="button"
        variant="primary"
        onClick={() => {
          void onAttach();
        }}
        disabled={!canAttach}
        data-testid="viewer-annotation-attach"
      >
        <TbLink size={14} />
        {attachLabel}
      </Button>

      <Button
        type="button"
        variant="ghost"
        onClick={onCancel}
        data-testid="viewer-annotation-cancel"
      >
        Cancel
      </Button>
    </div>
  );
}
