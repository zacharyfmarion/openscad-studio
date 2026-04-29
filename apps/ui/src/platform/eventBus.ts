import type { ExportFormat } from './types';

interface EventMap {
  'menu:file:new': void;
  'menu:file:open': void;
  'menu:file:save': void;
  'menu:file:save_as': void;
  'menu:file:export': ExportFormat;
  'menu:file:save_project': void;
  'menu:file:open_folder': void;
  'menu:file:open_project': void;
  'menu:file:save_all': void;
  'render-requested': { source?: 'ai' };
  'history:restore': { code: string };
  'code-updated': {
    code: string;
    source: 'customizer' | 'editor' | 'ai' | 'history' | 'file-open';
  };
  'settings:changed': void;
}

type EventCallback<T> = T extends void ? () => void : (payload: T) => void;

// eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
type AnyCallback = Function;

class EventBus {
  private listeners = new Map<string, Set<AnyCallback>>();

  on<K extends keyof EventMap>(event: K, callback: EventCallback<EventMap[K]>): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback as AnyCallback);

    return () => {
      this.off(event, callback);
    };
  }

  emit<K extends keyof EventMap>(
    event: K,
    ...args: EventMap[K] extends void ? [] : [EventMap[K]]
  ): void {
    const callbacks = this.listeners.get(event);
    if (!callbacks) return;

    for (const cb of callbacks) {
      try {
        if (args.length > 0) {
          cb(args[0]);
        } else {
          cb();
        }
      } catch (err) {
        console.error(`[EventBus] Error in handler for "${event}":`, err);
      }
    }
  }

  off<K extends keyof EventMap>(event: K, callback: EventCallback<EventMap[K]>): void {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      callbacks.delete(callback as AnyCallback);
      if (callbacks.size === 0) {
        this.listeners.delete(event);
      }
    }
  }

  removeAllListeners(event?: keyof EventMap): void {
    if (event) {
      this.listeners.delete(event);
    } else {
      this.listeners.clear();
    }
  }
}

export const eventBus = new EventBus();
export type { EventMap };
