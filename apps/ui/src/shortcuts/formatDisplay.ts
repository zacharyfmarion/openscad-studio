import { getShortcutDefinition } from './registry';
import type { KeyCombo, ShortcutActionId, ShortcutCategory, ShortcutDefinition } from './types';

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

const MOD_LABEL = isMac ? '\u2318' : 'Ctrl';
const SHIFT_LABEL = isMac ? '\u21E7' : 'Shift';
const ALT_LABEL = isMac ? '\u2325' : 'Alt';

const KEY_LABELS: Record<string, string> = {
  '?': '?',
  ',': ',',
};

export interface ShortcutGroup {
  title: string;
  items: {
    action: string;
    shortcut: string;
  }[];
}

export function formatKeyCombo(combo: KeyCombo): string {
  const parts: string[] = [];
  if (combo.mod) parts.push(MOD_LABEL);
  if (combo.alt) parts.push(ALT_LABEL);
  if (combo.shift) parts.push(SHIFT_LABEL);
  parts.push(KEY_LABELS[combo.key] ?? combo.key.toUpperCase());
  return isMac ? parts.join('') : parts.join('+');
}

export function formatShortcutKeys(definition: ShortcutDefinition): string {
  if (definition.keys.length === 0) {
    return '';
  }

  return formatKeyCombo(definition.keys[0]);
}

export function getShortcutDisplay(id: ShortcutActionId): string {
  const definition = getShortcutDefinition(id);
  return definition ? formatShortcutKeys(definition) : '';
}

export function groupShortcutsByCategory(definitions: ShortcutDefinition[]): ShortcutGroup[] {
  const order: ShortcutCategory[] = ['File', 'Edit', 'Workspace', 'AI Assistant', 'Help'];
  const groups = new Map<string, ShortcutGroup['items']>();

  for (const definition of definitions) {
    if (!groups.has(definition.category)) {
      groups.set(definition.category, []);
    }

    groups.get(definition.category)!.push({
      action: definition.label,
      shortcut: formatShortcutKeys(definition),
    });
  }

  return order
    .filter((category) => groups.has(category))
    .map((category) => ({
      title: category,
      items: groups.get(category) ?? [],
    }));
}
