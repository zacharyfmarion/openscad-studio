import type { TabId, TabRenderState, WorkspaceStoreState, WorkspaceTab } from './workspaceTypes';

export const DEFAULT_TAB_NAME = 'main.scad';
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
  projectPath?: string;
}): WorkspaceTab {
  const name = args?.name ?? DEFAULT_TAB_NAME;

  return {
    id: args?.id ?? createTabId(),
    filePath: args?.filePath ?? null,
    name,
    projectPath: args?.projectPath ?? name,
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
