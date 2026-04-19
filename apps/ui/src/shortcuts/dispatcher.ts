import type { KeyCombo, ShortcutDefinition, ShortcutHandler } from './types';
import { isTextInputFocused } from './focusDetection';

function normalizeEvent(event: KeyboardEvent): KeyCombo {
  return {
    key: event.key.toLowerCase(),
    mod: event.metaKey || event.ctrlKey,
    shift: event.shiftKey,
    alt: event.altKey,
  };
}

function combosMatch(combo: KeyCombo, event: KeyCombo): boolean {
  return (
    combo.key === event.key &&
    combo.mod === event.mod &&
    combo.shift === event.shift &&
    combo.alt === event.alt
  );
}

class ShortcutDispatcher {
  private registry: ShortcutDefinition[] = [];
  private handlers = new Map<string, ShortcutHandler>();
  private detach: (() => void) | null = null;

  setRegistry(definitions: ShortcutDefinition[]): void {
    this.registry = definitions;
  }

  register(id: string, handler: ShortcutHandler): () => void {
    this.handlers.set(id, handler);
    return () => this.handlers.delete(id);
  }

  attach(): () => void {
    if (this.detach) {
      return this.detach;
    }

    const listener = (event: KeyboardEvent) => {
      if (event.defaultPrevented) {
        return;
      }

      const eventCombo = normalizeEvent(event);
      const textFocused = isTextInputFocused(event);

      for (const definition of this.registry) {
        const matched = definition.keys.some((combo) => combosMatch(combo, eventCombo));
        if (!matched) {
          continue;
        }

        if (definition.context === 'app' && textFocused) {
          continue;
        }

        if (event.repeat && !definition.repeat) {
          continue;
        }

        if (definition.when && !definition.when()) {
          continue;
        }

        const handler = this.handlers.get(definition.id);
        if (!handler) {
          continue;
        }

        event.preventDefault();
        event.stopPropagation();
        handler(event);
        return;
      }
    };

    window.addEventListener('keydown', listener);
    this.detach = () => {
      window.removeEventListener('keydown', listener);
      this.detach = null;
    };

    return this.detach;
  }
}

export const shortcutDispatcher = new ShortcutDispatcher();
