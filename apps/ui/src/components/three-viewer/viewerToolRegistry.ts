import type React from 'react';
import { TbPointer, TbRuler, TbBox, TbScissors } from 'react-icons/tb';
import type { InteractionMode, ToolContextPanelProps } from './types';
import { SectionPlanePanel } from './panels/SectionPlanePanel';
import { MeasurePanel } from './panels/MeasurePanel';
import { BBoxPanel } from './panels/BBoxPanel';

export interface ViewerToolDefinition {
  id: InteractionMode;
  label: string;
  icon: React.ComponentType<{ size?: number }>;
  shortcut: string | null;
  contextPanel?: React.ComponentType<ToolContextPanelProps>;
}

export const VIEWER_TOOLS: ViewerToolDefinition[] = [
  { id: 'orbit', label: 'Orbit', icon: TbPointer, shortcut: 'Esc' },
  {
    id: 'measure-distance',
    label: 'Measure',
    icon: TbRuler,
    shortcut: 'M',
    contextPanel: MeasurePanel,
  },
  { id: 'measure-bbox', label: 'Bounds', icon: TbBox, shortcut: 'B', contextPanel: BBoxPanel },
  {
    id: 'section-plane',
    label: 'Section',
    icon: TbScissors,
    shortcut: 'S',
    contextPanel: SectionPlanePanel,
  },
];
