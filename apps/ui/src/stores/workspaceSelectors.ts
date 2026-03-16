import type { WorkspaceStore, WorkspaceTab } from './workspaceTypes';

export function selectTabs(state: WorkspaceStore) {
  return state.tabs;
}

export function selectActiveTabId(state: WorkspaceStore) {
  return state.activeTabId;
}

export function selectShowWelcome(state: WorkspaceStore) {
  return state.showWelcome;
}

export function selectActiveTab(state: WorkspaceStore): WorkspaceTab | undefined {
  if (state.tabs.length === 0) {
    return undefined;
  }

  return state.tabs.find((tab) => tab.id === state.activeTabId) ?? state.tabs[0];
}

export function selectActiveRender(state: WorkspaceStore) {
  return selectActiveTab(state)?.render;
}

export function selectWorkingDirectory(state: WorkspaceStore): string | null {
  const filePath = selectActiveTab(state)?.filePath;
  if (!filePath) {
    return null;
  }

  const separatorIndex = filePath.lastIndexOf('/');
  if (separatorIndex <= 0) {
    return null;
  }

  return filePath.substring(0, separatorIndex);
}
