import type { ReactNode } from 'react';
import { TbAdjustmentsHorizontal, TbPencil, TbSparkles } from 'react-icons/tb';
import type { WorkspacePreset } from '../stores/layoutStore';
import { SegmentedControl } from './ui';

type HeaderLayoutPreset = Extract<WorkspacePreset, 'default' | 'ai-first' | 'customizer-first'>;

const LAYOUT_OPTIONS = [
  {
    value: 'ai-first' as const,
    label: 'AI',
    icon: <TbSparkles size={13} aria-hidden="true" />,
    title: 'Switch to the AI-first workspace',
  },
  {
    value: 'default' as const,
    label: 'Edit',
    icon: <TbPencil size={13} aria-hidden="true" />,
    title: 'Switch to the editor-first workspace',
  },
  {
    value: 'customizer-first' as const,
    label: 'Customize',
    icon: <TbAdjustmentsHorizontal size={13} aria-hidden="true" />,
    title: 'Switch to the customizer-first workspace',
  },
] satisfies Array<{
  value: HeaderLayoutPreset;
  label: string;
  icon: ReactNode;
  title: string;
}>;

interface HeaderWorkspaceControlsProps {
  layoutPreset: HeaderLayoutPreset;
  onLayoutPresetChange: (preset: HeaderLayoutPreset) => void;
}

export function HeaderWorkspaceControls({
  layoutPreset,
  onLayoutPresetChange,
}: HeaderWorkspaceControlsProps) {
  return (
    <div className="shrink-0">
      <SegmentedControl
        size="sm"
        density="compact"
        aria-label="Workspace layout"
        options={LAYOUT_OPTIONS}
        value={layoutPreset}
        onChange={onLayoutPresetChange}
      />
    </div>
  );
}

export type { HeaderLayoutPreset };
