import { VIEWER_TOOLS } from './viewerToolRegistry';
import type { InteractionMode, ToolContextPanelProps } from './types';

interface ViewerContextBarProps extends ToolContextPanelProps {
  mode: InteractionMode;
}

export function ViewerContextBar({ mode, ...panelProps }: ViewerContextBarProps) {
  const tool = VIEWER_TOOLS.find((t) => t.id === mode);
  const ContextPanel = tool?.contextPanel;

  return (
    <div
      className="flex items-center shrink-0"
      style={{
        height: '52px',
        borderTop: '1px solid var(--border-primary)',
        backgroundColor: 'var(--bg-secondary)',
      }}
      data-testid="preview-context-bar"
    >
      {ContextPanel ? <ContextPanel {...panelProps} /> : null}
    </div>
  );
}
