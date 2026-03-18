import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';
import {
  createEmptyRenderState,
  createInitialWorkspaceState,
  createWorkspaceTab,
} from './workspaceFactories';
import type { WorkspaceStore, WorkspaceStoreState } from './workspaceTypes';

function closeTabState(state: WorkspaceStoreState, id: string): WorkspaceStoreState {
  const filtered = state.tabs.filter((tab) => tab.id !== id);

  if (filtered.length === 0) {
    const resetState = createInitialWorkspaceState();
    return {
      ...resetState,
      showWelcome: true,
    };
  }

  if (state.activeTabId !== id) {
    return {
      ...state,
      tabs: filtered,
    };
  }

  const closingIndex = state.tabs.findIndex((tab) => tab.id === id);
  const nextActiveTab = filtered[Math.max(0, closingIndex - 1)] ?? filtered[0];

  return {
    ...state,
    tabs: filtered,
    activeTabId: nextActiveTab?.id ?? null,
  };
}

function reorderByIds(state: WorkspaceStoreState, tabIdsInOrder: string[]) {
  const tabById = new Map(state.tabs.map((tab) => [tab.id, tab]));
  const nextTabs = tabIdsInOrder
    .map((id) => tabById.get(id))
    .filter((tab): tab is NonNullable<typeof tab> => Boolean(tab));

  if (nextTabs.length !== state.tabs.length) {
    return state.tabs;
  }

  return nextTabs;
}

export function createWorkspaceStore(
  initialState: WorkspaceStoreState = createInitialWorkspaceState()
) {
  return createStore<WorkspaceStore>()((set, get) => ({
    ...initialState,

    createTab: (args = {}) => {
      const newTab = createWorkspaceTab({
        filePath: args.filePath,
        name: args.name,
        content: args.content,
      });

      set((state) => ({
        ...state,
        tabs: [...state.tabs, newTab],
        activeTabId: args.activate === false ? state.activeTabId : newTab.id,
      }));

      return newTab.id;
    },

    setActiveTab: (id) => {
      set((state) => {
        if (!state.tabs.some((tab) => tab.id === id)) {
          return state;
        }

        return {
          ...state,
          activeTabId: id,
        };
      });
    },

    updateTabContent: (id, content) => {
      set((state) => ({
        ...state,
        tabs: state.tabs.map((tab) =>
          tab.id === id ? { ...tab, content, isDirty: content !== tab.savedContent } : tab
        ),
      }));
    },

    setTabCustomizerBase: (id, content) => {
      set((state) => ({
        ...state,
        tabs: state.tabs.map((tab) =>
          tab.id === id ? { ...tab, customizerBaseContent: content } : tab
        ),
      }));
    },

    renameTab: (id, name) => {
      set((state) => ({
        ...state,
        tabs: state.tabs.map((tab) => (tab.id === id ? { ...tab, name } : tab)),
      }));
    },

    markTabSaved: (id, args) => {
      set((state) => ({
        ...state,
        tabs: state.tabs.map((tab) =>
          tab.id === id
            ? {
                ...tab,
                filePath: args.filePath,
                name: args.name,
                savedContent: args.savedContent,
                isDirty: tab.content !== args.savedContent,
              }
            : tab
        ),
      }));
    },

    closeTabLocal: (id) => {
      set((state) => closeTabState(state, id));
    },

    replaceWelcomeTab: (args) => {
      const state = get();
      const firstTab = state.tabs[0];
      const shouldReplaceFirstTab =
        state.showWelcome &&
        state.tabs.length === 1 &&
        firstTab &&
        !firstTab.filePath &&
        !firstTab.isDirty;

      if (!shouldReplaceFirstTab) {
        return get().createTab({
          filePath: args.filePath,
          name: args.name,
          content: args.content,
        });
      }

      set((current) => ({
        ...current,
        tabs: current.tabs.map((tab, index) =>
          index === 0
            ? {
                ...tab,
                filePath: args.filePath,
                name: args.name,
                content: args.content,
                customizerBaseContent: args.content,
                savedContent: args.content,
                isDirty: false,
                render: createEmptyRenderState(),
              }
            : tab
        ),
        activeTabId: firstTab.id,
      }));

      return firstTab.id;
    },

    reorderTabs: (tabIdsInOrder) => {
      set((state) => ({
        ...state,
        tabs: reorderByIds(state, tabIdsInOrder),
      }));
    },

    beginTabRender: (id, args) => {
      const targetTab = get().tabs.find((tab) => tab.id === id);
      if (!targetTab) {
        return 0;
      }

      const requestId = targetTab.render.requestId + 1;

      set((state) => ({
        ...state,
        tabs: state.tabs.map((tab) =>
          tab.id === id
            ? {
                ...tab,
                render: {
                  ...tab.render,
                  status: 'rendering',
                  error: '',
                  requestId,
                  dimensionMode: args?.preferredDimension ?? tab.render.dimensionMode,
                },
              }
            : tab
        ),
      }));

      return requestId;
    },

    commitTabRenderResult: (id, result) => {
      set((state) => ({
        ...state,
        tabs: state.tabs.map((tab) => {
          if (tab.id !== id || tab.render.requestId !== result.requestId) {
            return tab;
          }

          return {
            ...tab,
            render: {
              ...tab.render,
              status: 'ready',
              previewSrc: result.previewSrc,
              previewKind: result.previewKind,
              diagnostics: result.diagnostics,
              error: '',
              dimensionMode: result.dimensionMode,
              lastRenderedContent: result.lastRenderedContent,
            },
          };
        }),
      }));
    },

    commitTabRenderError: (id, result) => {
      set((state) => ({
        ...state,
        tabs: state.tabs.map((tab) => {
          if (tab.id !== id || tab.render.requestId !== result.requestId) {
            return tab;
          }

          return {
            ...tab,
            render: {
              ...tab.render,
              status: 'error',
              error: result.error,
              diagnostics: result.diagnostics ?? tab.render.diagnostics,
              lastRenderedContent: result.lastRenderedContent ?? tab.render.lastRenderedContent,
            },
          };
        }),
      }));
    },

    invalidateTabRender: (id) => {
      set((state) => ({
        ...state,
        tabs: state.tabs.map((tab) =>
          tab.id === id
            ? {
                ...tab,
                render: {
                  ...tab.render,
                  requestId: tab.render.requestId + 1,
                  status: 'idle',
                },
              }
            : tab
        ),
      }));
    },

    clearTabRender: (id) => {
      set((state) => ({
        ...state,
        tabs: state.tabs.map((tab) =>
          tab.id === id
            ? {
                ...tab,
                render: {
                  ...createEmptyRenderState(),
                  requestId: tab.render.requestId,
                },
              }
            : tab
        ),
      }));
    },

    showWelcomeScreen: () => {
      set((state) => ({
        ...state,
        showWelcome: true,
      }));
    },

    hideWelcomeScreen: () => {
      set((state) => ({
        ...state,
        showWelcome: false,
      }));
    },

    setShowWelcome: (showWelcome) => {
      set((state) => ({
        ...state,
        showWelcome,
      }));
    },

    hydrateWorkspace: (state) => {
      set(() => ({
        ...state,
      }));
    },

    resetWorkspace: () => {
      set(() => createInitialWorkspaceState());
    },
  }));
}

export const workspaceStore = createWorkspaceStore();

export function useWorkspaceStore<T>(selector: (state: WorkspaceStore) => T): T {
  return useStore(workspaceStore, selector);
}

export function getWorkspaceState() {
  return workspaceStore.getState();
}

export function resetWorkspaceStore() {
  workspaceStore.getState().resetWorkspace();
}
