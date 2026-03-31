import { createStore } from 'zustand/vanilla';
import { useStore } from 'zustand';
import type { RenderTrigger } from '../analytics/runtime';

export interface RenderRequest {
  /** Monotonically increasing ID for deduplication */
  id: number;
  /** Why this render was requested (for analytics) */
  trigger: RenderTrigger;
  /** Skip debounce — render immediately */
  immediate: boolean;
  /** Optional code override (e.g., history restore where the store may not have settled yet) */
  code?: string;
}

interface RenderRequestState {
  pendingRequest: RenderRequest | null;
  nextId: number;
}

interface RenderRequestActions {
  /** Request a render. The orchestrator will pick it up and dispatch to useOpenScad. */
  requestRender: (
    trigger: RenderTrigger,
    opts?: { immediate?: boolean; code?: string }
  ) => void;
  /** Mark the current request as consumed (called by the orchestrator). */
  consumeRequest: () => void;
}

export type RenderRequestStoreState = RenderRequestState & RenderRequestActions;

const renderRequestStore = createStore<RenderRequestStoreState>((set, get) => ({
  pendingRequest: null,
  nextId: 1,

  requestRender: (trigger, opts) => {
    const { nextId } = get();
    set({
      pendingRequest: {
        id: nextId,
        trigger,
        immediate: opts?.immediate ?? false,
        code: opts?.code,
      },
      nextId: nextId + 1,
    });
  },

  consumeRequest: () => {
    set({ pendingRequest: null });
  },
}));

export function getRenderRequestStore() {
  return renderRequestStore;
}

export function requestRender(
  trigger: RenderTrigger,
  opts?: { immediate?: boolean; code?: string }
) {
  renderRequestStore.getState().requestRender(trigger, opts);
}

export function useRenderRequestStore<T>(selector: (state: RenderRequestStoreState) => T): T {
  return useStore(renderRequestStore, selector);
}
