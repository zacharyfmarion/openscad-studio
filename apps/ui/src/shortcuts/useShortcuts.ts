import { useEffect } from 'react';
import { shortcutDispatcher } from './dispatcher';
import { SHORTCUT_REGISTRY } from './registry';
import type { ShortcutActionId } from './types';

type ShortcutHandlers = Partial<Record<ShortcutActionId, () => void>>;

export function useShortcuts(handlers: ShortcutHandlers): void {
  useEffect(() => {
    shortcutDispatcher.setRegistry(SHORTCUT_REGISTRY);

    const unregisters = Object.entries(handlers)
      .filter((entry): entry is [ShortcutActionId, () => void] => typeof entry[1] === 'function')
      .map(([id, handler]) => shortcutDispatcher.register(id, () => handler()));

    const detach = shortcutDispatcher.attach();

    return () => {
      unregisters.forEach((unregister) => unregister());
      detach();
    };
  }, [handlers]);
}
