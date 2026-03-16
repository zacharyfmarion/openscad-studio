import type { TabId, TabRenderState, WorkspaceStoreState, WorkspaceTab } from './workspaceTypes';

export const DEFAULT_TAB_NAME = 'Untitled';
export const DEFAULT_OPENSCAD_CODE = '// Type your OpenSCAD code here\ncube([10, 10, 10]);';

export function createTabId(): TabId {
  return Math.random().toString(36).substring(2, 11);
}

export function createEmptyRenderState(): TabRenderState {
  return {
    status: 'idle',
    previewSrc: '',
    previewKind: 'mesh',
    diagnostics: [],
    error: '',
    dimensionMode: null,
    lastRenderedContent: null,
    requestId: 0,
  };
}

export function createWorkspaceTab(args?: {
  id?: TabId;
  filePath?: string | null;
  name?: string;
  content?: string;
}): WorkspaceTab {
  const content = args?.content ?? DEFAULT_OPENSCAD_CODE;

  return {
    id: args?.id ?? createTabId(),
    filePath: args?.filePath ?? null,
    name: args?.name ?? DEFAULT_TAB_NAME,
    content,
    savedContent: content,
    isDirty: false,
    render: createEmptyRenderState(),
  };
}

export function createInitialWorkspaceState(): WorkspaceStoreState {
  const initialTab = createWorkspaceTab();
  return {
    tabs: [initialTab],
    activeTabId: initialTab.id,
    showWelcome: true,
  };
}
