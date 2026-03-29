import type { ReactNode } from 'react';
import { TbAdjustmentsHorizontal, TbDownload, TbPencil, TbSparkles } from 'react-icons/tb';
import type { WorkspacePreset } from '../stores/layoutStore';
import { SegmentedControl, Tooltip, TooltipContent, TooltipTrigger } from './ui';

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
  downloadUrl: string;
}

export function HeaderWorkspaceControls({
  layoutPreset,
  onLayoutPresetChange,
  downloadUrl,
}: HeaderWorkspaceControlsProps) {
  return (
    <div className="flex items-center gap-1.5 shrink-0">
      <SegmentedControl
        size="sm"
        density="compact"
        aria-label="Workspace layout"
        options={LAYOUT_OPTIONS}
        value={layoutPreset}
        onChange={onLayoutPresetChange}
      />

      <Tooltip>
        <TooltipTrigger asChild>
          <a
            href={downloadUrl}
            aria-label="Download for Mac"
            title="Download for Mac"
            className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-transparent bg-transparent text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-primary)]"
          >
            <TbDownload size={14} />
          </a>
        </TooltipTrigger>
        <TooltipContent side="bottom">Download for Mac</TooltipContent>
      </Tooltip>
    </div>
  );
}

export type { HeaderLayoutPreset };
