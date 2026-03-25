import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';
import type {
  ShareContext,
  ShareData,
  ShareEntryPhase,
  ShareEntryState,
  ShareOrigin,
} from '../types/share';

export interface ShareEntryStoreActions {
  setContext: (context: ShareContext | null) => void;
  startFetching: () => void;
  setShareData: (shareData: ShareData) => void;
  startApplying: () => void;
  startRendering: (args: { origin: ShareOrigin; targetTabId: string }) => void;
  markReady: () => void;
  fail: (message: string) => void;
  retry: () => void;
  skip: () => void;
  dismissBanner: () => void;
  reset: () => void;
}

export type ShareEntryStore = ShareEntryState & ShareEntryStoreActions;

function createInitialState(context: ShareContext | null = null): ShareEntryState {
  return {
    context,
    phase: context ? 'idle' : 'skipped',
    shareData: null,
    origin: null,
    error: null,
    isBannerDismissed: false,
    targetTabId: null,
  };
}

export function createShareEntryStore(initialContext: ShareContext | null = null) {
  return createStore<ShareEntryStore>()((set) => ({
    ...createInitialState(initialContext),

    setContext: (context) => {
      set((state) => {
        if (state.context?.shareId === context?.shareId && state.context?.mode === context?.mode) {
          return state;
        }

        return {
          ...createInitialState(context),
        };
      });
    },

    startFetching: () => {
      set((state) => ({
        ...state,
        phase: state.context ? 'fetching' : 'skipped',
        shareData: null,
        origin: null,
        error: null,
        targetTabId: null,
        isBannerDismissed: false,
      }));
    },

    setShareData: (shareData) => {
      set((state) => ({
        ...state,
        shareData,
        error: null,
      }));
    },

    startApplying: () => {
      set((state) => ({
        ...state,
        phase: state.context ? 'applying' : 'skipped',
        error: null,
      }));
    },

    startRendering: ({ origin, targetTabId }) => {
      set((state) => ({
        ...state,
        origin,
        targetTabId,
        phase: 'rendering',
        error: null,
        isBannerDismissed: false,
      }));
    },

    markReady: () => {
      set((state) => {
        if (state.phase !== 'rendering') {
          return state;
        }

        return {
          ...state,
          phase: 'ready',
        };
      });
    },

    fail: (message) => {
      set((state) => ({
        ...state,
        phase: 'error',
        error: message,
        targetTabId: null,
      }));
    },

    retry: () => {
      set((state) => ({
        ...createInitialState(state.context),
      }));
    },

    skip: () => {
      set((state) => ({
        ...state,
        phase: 'skipped',
        error: null,
        origin: null,
        targetTabId: null,
      }));
    },

    dismissBanner: () => {
      set((state) => ({
        ...state,
        isBannerDismissed: true,
      }));
    },

    reset: () => {
      set(() => ({
        ...createInitialState(null),
      }));
    },
  }));
}

function getInitialContext(): ShareContext | null {
  if (typeof window === 'undefined') {
    return null;
  }

  return window.__SHARE_CONTEXT ?? null;
}

export const shareEntryStore = createShareEntryStore(getInitialContext());

export function useShareEntryStore<T>(selector: (state: ShareEntryStore) => T): T {
  return useStore(shareEntryStore, selector);
}

export function getShareEntryState() {
  return shareEntryStore.getState();
}

export function resetShareEntryStore(context: ShareContext | null = getInitialContext()) {
  shareEntryStore.setState(createInitialState(context));
}

export function isShareEntryBlockingPhase(phase: ShareEntryPhase): boolean {
  return phase === 'idle' || phase === 'fetching' || phase === 'applying' || phase === 'rendering';
}
