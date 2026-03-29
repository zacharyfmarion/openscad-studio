import type { ComponentType } from 'react';
import { TbBrush, TbPointer, TbRuler } from 'react-icons/tb';
import type { ViewMode } from './types';

export const SVG_2D_TOOLS: {
  id: ViewMode;
  label: string;
  icon: ComponentType<{ size?: number }>;
  shortcut: string;
}[] = [
  { id: 'pan', label: 'Pan', icon: TbPointer, shortcut: 'Esc' },
  { id: 'measure-distance', label: 'Measure', icon: TbRuler, shortcut: 'M' },
  { id: 'annotate', label: 'Annotate', icon: TbBrush, shortcut: 'A' },
];
