import type { ShortcutActionId, ShortcutDefinition } from './types';

const key = (value: string) => ({ key: value, mod: false, shift: false, alt: false });
const mod = (value: string) => ({ key: value, mod: true, shift: false, alt: false });
const modShift = (value: string) => ({ key: value, mod: true, shift: true, alt: false });
const modAlt = (value: string) => ({ key: value, mod: true, shift: false, alt: true });
const shift = (value: string) => ({ key: value, mod: false, shift: true, alt: false });

export const SHORTCUT_REGISTRY: ShortcutDefinition[] = [
  {
    id: 'file.new',
    label: 'New File',
    category: 'File',
    keys: [mod('n')],
    context: 'global',
  },
  {
    id: 'file.open',
    label: 'Open File',
    category: 'File',
    keys: [mod('o')],
    context: 'global',
  },
  {
    id: 'file.save',
    label: 'Save',
    category: 'File',
    keys: [mod('s')],
    context: 'global',
  },
  {
    id: 'file.saveAs',
    label: 'Save As',
    category: 'File',
    keys: [modShift('s')],
    context: 'global',
  },
  {
    id: 'file.saveAll',
    label: 'Save All',
    category: 'File',
    keys: [modAlt('s')],
    context: 'global',
  },
  {
    id: 'file.settings',
    label: 'Settings',
    category: 'File',
    keys: [mod(',')],
    context: 'global',
  },
  {
    id: 'edit.undo',
    label: 'Undo',
    category: 'Edit',
    keys: [mod('z')],
    context: 'app',
  },
  {
    id: 'edit.redo',
    label: 'Redo',
    category: 'Edit',
    keys: [modShift('z')],
    context: 'app',
  },
  {
    id: 'workspace.newTab',
    label: 'New Tab',
    category: 'Workspace',
    keys: [mod('t')],
    context: 'global',
  },
  {
    id: 'workspace.closeTab',
    label: 'Close Tab',
    category: 'Workspace',
    keys: [mod('w')],
    context: 'global',
  },
  {
    id: 'assistant.focus',
    label: 'Focus AI Assistant',
    category: 'AI Assistant',
    keys: [mod('k')],
    context: 'global',
  },
  {
    id: 'help.shortcuts',
    label: 'Show Keyboard Shortcuts',
    category: 'Help',
    keys: [key('?'), shift('/')],
    context: 'app',
  },
];

export function getShortcutDefinition(id: ShortcutActionId): ShortcutDefinition | undefined {
  return SHORTCUT_REGISTRY.find((definition) => definition.id === id);
}
