export type ShortcutContext = 'global' | 'app';

export type ShortcutCategory = 'File' | 'Edit' | 'Workspace' | 'AI Assistant' | 'Help';

export type ShortcutActionId =
  | 'file.new'
  | 'file.open'
  | 'file.save'
  | 'file.saveAs'
  | 'file.saveAll'
  | 'file.settings'
  | 'edit.undo'
  | 'edit.redo'
  | 'workspace.newTab'
  | 'workspace.closeTab'
  | 'assistant.focus'
  | 'help.shortcuts';

export interface KeyCombo {
  key: string;
  mod: boolean;
  shift: boolean;
  alt: boolean;
}

export interface ShortcutDefinition {
  id: ShortcutActionId;
  label: string;
  category: ShortcutCategory;
  keys: KeyCombo[];
  context: ShortcutContext;
  when?: () => boolean;
  repeat?: boolean;
}

export type ShortcutHandler = (event: KeyboardEvent) => void;
