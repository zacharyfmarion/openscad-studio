import type { Diagnostic } from '../platform/historyService';

export type TabId = string;
export type RenderStatus = 'idle' | 'rendering' | 'ready' | 'error';
export type WorkspaceRenderKind = 'mesh' | 'svg';
export type WorkspaceDimensionMode = '2d' | '3d' | null;

export interface TabRenderState {
  status: RenderStatus;
  previewSrc: string;
  previewKind: WorkspaceRenderKind;
  diagnostics: Diagnostic[];
  error: string;
  dimensionMode: WorkspaceDimensionMode;
  lastRenderedContent: string | null;
  requestId: number;
}

export interface WorkspaceTab {
  id: TabId;
  filePath: string | null;
  name: string;
  content: string;
  savedContent: string;
  isDirty: boolean;
  render: TabRenderState;
}

export interface WorkspaceStoreState {
  tabs: WorkspaceTab[];
  activeTabId: TabId | null;
  showWelcome: boolean;
}

export interface WorkspaceStoreActions {
  createTab: (args?: {
    filePath?: string | null;
    name?: string;
    content?: string;
    activate?: boolean;
  }) => TabId;
  setActiveTab: (id: TabId) => void;
  updateTabContent: (id: TabId, content: string) => void;
  renameTab: (id: TabId, name: string) => void;
  markTabSaved: (
    id: TabId,
    args: { filePath: string | null; name: string; savedContent: string }
  ) => void;
  closeTabLocal: (id: TabId) => void;
  replaceWelcomeTab: (args: { filePath: string | null; name: string; content: string }) => TabId;
  reorderTabs: (tabIdsInOrder: TabId[]) => void;
  beginTabRender: (id: TabId, args?: { preferredDimension?: WorkspaceDimensionMode }) => number;
  commitTabRenderResult: (
    id: TabId,
    result: {
      requestId: number;
      previewSrc: string;
      previewKind: WorkspaceRenderKind;
      diagnostics: Diagnostic[];
      dimensionMode: Exclude<WorkspaceDimensionMode, null>;
      lastRenderedContent: string;
    }
  ) => void;
  commitTabRenderError: (
    id: TabId,
    result: {
      requestId: number;
      error: string;
      diagnostics?: Diagnostic[];
      lastRenderedContent?: string;
    }
  ) => void;
  invalidateTabRender: (id: TabId) => void;
  clearTabRender: (id: TabId) => void;
  showWelcomeScreen: () => void;
  hideWelcomeScreen: () => void;
  setShowWelcome: (showWelcome: boolean) => void;
  hydrateWorkspace: (state: WorkspaceStoreState) => void;
  resetWorkspace: () => void;
}

export type WorkspaceStore = WorkspaceStoreState & WorkspaceStoreActions;
