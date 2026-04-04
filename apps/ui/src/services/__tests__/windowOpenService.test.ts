/** @jest-environment jsdom */

import { jest } from '@jest/globals';
import { openFileInWindow, openWorkspaceFolderInWindow } from '../windowOpenService';
import { getProjectStore } from '../../stores/projectStore';
import { getRenderRequestStore } from '../../stores/renderRequestStore';
import { DEFAULT_TAB_NAME } from '../../stores/workspaceFactories';
import {
  getWorkspaceState,
  resetWorkspaceStore,
  workspaceStore,
} from '../../stores/workspaceStore';

function resetStores() {
  getProjectStore().getState().resetProject();
  resetWorkspaceStore();
  getRenderRequestStore().setState({
    pendingRequest: null,
    nextId: 1,
  });
}

describe('windowOpenService', () => {
  beforeEach(() => {
    resetStores();
  });

  it('opens a workspace folder and hydrates the window state before render', async () => {
    const platform = {
      capabilities: { hasFileSystem: true },
      createDirectory: jest.fn(async () => {}),
      readDirectoryFiles: jest.fn(async () => ({
        'main.scad': 'cube(10);',
        'parts/brace.scad': 'cube(2);',
      })),
      readSubdirectories: jest.fn(async () => ['parts', 'empty']),
      writeTextFile: jest.fn(async () => {}),
    };

    const result = await openWorkspaceFolderInWindow('/tmp/pine-fiber', { platform });

    expect(result).toMatchObject({
      workspaceRoot: '/tmp/pine-fiber',
      renderTargetPath: 'main.scad',
      fileCount: 2,
      createdDefaultFile: false,
      emptyFolders: ['empty'],
    });

    const projectState = getProjectStore().getState();
    expect(projectState.projectRoot).toBe('/tmp/pine-fiber');
    expect(projectState.renderTargetPath).toBe('main.scad');
    expect(projectState.emptyFolders).toEqual(['empty']);
    expect(Object.keys(projectState.files)).toEqual(['main.scad', 'parts/brace.scad']);

    const workspaceState = getWorkspaceState();
    expect(workspaceState.showWelcome).toBe(false);
    expect(workspaceState.tabs).toHaveLength(1);
    expect(workspaceState.tabs[0]?.filePath).toBe('/tmp/pine-fiber/main.scad');
    expect(workspaceState.tabs[0]?.projectPath).toBe('main.scad');
    expect(workspaceState.activeTabId).toBe(result.activeTabId);

    expect(getRenderRequestStore().getState().pendingRequest).toMatchObject({
      trigger: 'file_open',
      immediate: true,
    });
  });

  it('reuses an already-open file tab instead of duplicating the workspace', async () => {
    workspaceStore.getState().hydrateWorkspace({
      tabs: [
        {
          ...getWorkspaceState().tabs[0],
          filePath: '/tmp/pine-fiber/main.scad',
          name: 'main.scad',
          projectPath: 'main.scad',
        },
      ],
      activeTabId: getWorkspaceState().tabs[0]?.id ?? null,
      showWelcome: false,
    });
    getProjectStore()
      .getState()
      .openProject('/tmp/pine-fiber', { 'main.scad': 'cube(1);' }, 'main.scad');

    const result = await openFileInWindow(
      {
        path: '/tmp/pine-fiber/main.scad',
        name: 'main.scad',
        content: 'flower();',
      },
      {
        platform: {
          capabilities: { hasFileSystem: true },
          createDirectory: jest.fn(),
          readDirectoryFiles: jest.fn(),
          readSubdirectories: jest.fn(),
          writeTextFile: jest.fn(),
        },
      }
    );

    expect(result.reusedExistingTab).toBe(true);
    expect(getWorkspaceState().tabs).toHaveLength(1);
    expect(getProjectStore().getState().files['main.scad']?.content).toBe('cube(1);');
  });

  it('opens a virtual single-file project when no disk path exists', async () => {
    const result = await openFileInWindow(
      {
        path: null,
        name: '',
        content: 'sphere(5);',
      },
      {
        platform: {
          capabilities: { hasFileSystem: false },
          createDirectory: jest.fn(),
          readDirectoryFiles: jest.fn(),
          readSubdirectories: jest.fn(),
          writeTextFile: jest.fn(),
        },
      }
    );

    expect(result).toMatchObject({
      projectRoot: null,
      projectPath: DEFAULT_TAB_NAME,
      reusedExistingTab: false,
      fileCount: 1,
    });
    expect(getProjectStore().getState().files[DEFAULT_TAB_NAME]?.content).toBe('sphere(5);');
    expect(getWorkspaceState().showWelcome).toBe(false);
    expect(getRenderRequestStore().getState().pendingRequest).toMatchObject({
      trigger: 'file_open',
      immediate: true,
    });
  });
});
