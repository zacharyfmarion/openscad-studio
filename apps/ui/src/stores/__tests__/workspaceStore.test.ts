import { createEmptyRenderState, createWorkspaceTab } from '../workspaceFactories';
import { selectActiveRender, selectActiveTab, selectWorkingDirectory } from '../workspaceSelectors';
import { createWorkspaceStore } from '../workspaceStore';

describe('workspaceStore', () => {
  it('creates tabs with clean render state and activates them by default', () => {
    const store = createWorkspaceStore();
    const initialActiveTabId = store.getState().activeTabId;

    const newTabId = store.getState().createTab({
      name: 'part.scad',
      filePath: '/tmp/part.scad',
      projectPath: 'part.scad',
    });

    const state = store.getState();
    const newTab = state.tabs.find((tab) => tab.id === newTabId);

    expect(newTab).toBeDefined();
    expect(newTab?.render).toEqual(createEmptyRenderState());
    expect(newTab?.projectPath).toBe('part.scad');
    expect(state.activeTabId).toBe(newTabId);
    expect(state.activeTabId).not.toBe(initialActiveTabId);
  });

  it('marks a tab as saved with new filePath and name', () => {
    const store = createWorkspaceStore();
    const tabId = store.getState().activeTabId!;

    store.getState().markTabSaved(tabId, {
      filePath: '/tmp/model.scad',
      name: 'model.scad',
    });

    expect(store.getState().tabs[0]).toMatchObject({
      filePath: '/tmp/model.scad',
      name: 'model.scad',
    });
  });

  it('closes the last tab into a clean welcome state', () => {
    const store = createWorkspaceStore();
    const initialTabId = store.getState().activeTabId!;

    store.getState().closeTabLocal(initialTabId);

    const state = store.getState();
    expect(state.showWelcome).toBe(true);
    expect(state.tabs).toHaveLength(1);
    expect(state.activeTabId).toBe(state.tabs[0].id);
    expect(state.tabs[0].render).toEqual(createEmptyRenderState());
  });

  it('replaces the welcome tab without inheriting stale render state', () => {
    const store = createWorkspaceStore();
    const tabId = store.getState().activeTabId!;
    const requestId = store.getState().beginTabRender(tabId, { preferredDimension: '3d' });

    store.getState().commitTabRenderResult(tabId, {
      requestId,
      previewSrc: 'blob:mesh',
      previewKind: 'mesh',
      diagnostics: [],
      dimensionMode: '3d',
      lastRenderedContent: 'cube([10,10,10]);',
    });

    const replacedId = store.getState().replaceWelcomeTab({
      filePath: '/tmp/floorplan.scad',
      name: 'floorplan.scad',
      projectPath: 'floorplan.scad',
    });

    const replacedTab = store.getState().tabs.find((tab) => tab.id === replacedId)!;
    expect(replacedTab.filePath).toBe('/tmp/floorplan.scad');
    expect(replacedTab.projectPath).toBe('floorplan.scad');
    expect(replacedTab.render).toEqual(createEmptyRenderState());
  });

  it('opens a shared document into the welcome slot and exits welcome mode', () => {
    const store = createWorkspaceStore();
    const openedId = store.getState().openSharedDocument({
      name: 'shared-part',
      projectPath: 'shared-part',
    });

    const openedTab = store.getState().tabs.find((tab) => tab.id === openedId)!;
    expect(store.getState().showWelcome).toBe(false);
    expect(store.getState().activeTabId).toBe(openedId);
    expect(openedTab.name).toBe('shared-part');
    expect(openedTab.projectPath).toBe('shared-part');
    expect(openedTab.render).toEqual(createEmptyRenderState());
  });

  it('replaces the initial tab even when showWelcome is already false (mobile regression)', () => {
    const store = createWorkspaceStore();
    const initialTabId = store.getState().activeTabId!;

    // Simulate mobile: welcome screen dismissed before share loads
    store.getState().hideWelcomeScreen();
    expect(store.getState().showWelcome).toBe(false);

    const returnedTabId = store.getState().openSharedDocument({
      name: 'My Design',
      projectPath: 'My Design',
    });

    // Must replace (same ID), not create a new tab
    expect(returnedTabId).toBe(initialTabId);
    expect(store.getState().tabs).toHaveLength(1);
    expect(store.getState().activeTabId).toBe(initialTabId);
    expect(store.getState().tabs[0].name).toBe('My Design');
  });

  it('ignores stale render results by request id', () => {
    const store = createWorkspaceStore();
    const tabId = store.getState().activeTabId!;
    const request1 = store.getState().beginTabRender(tabId, { preferredDimension: '2d' });
    const request2 = store.getState().beginTabRender(tabId, { preferredDimension: '3d' });

    store.getState().commitTabRenderResult(tabId, {
      requestId: request1,
      previewSrc: 'blob:old',
      previewKind: 'svg',
      diagnostics: [],
      dimensionMode: '2d',
      lastRenderedContent: 'square([1,1]);',
    });

    expect(store.getState().tabs[0].render.previewSrc).toBe('');

    store.getState().commitTabRenderResult(tabId, {
      requestId: request2,
      previewSrc: 'blob:new',
      previewKind: 'mesh',
      diagnostics: [],
      dimensionMode: '3d',
      lastRenderedContent: 'cube([1,1,1]);',
    });

    expect(store.getState().tabs[0].render.previewSrc).toBe('blob:new');
    expect(store.getState().tabs[0].render.dimensionMode).toBe('3d');
  });

  it('invalidates and clears render state predictably', () => {
    const store = createWorkspaceStore();
    const tabId = store.getState().activeTabId!;
    const requestId = store.getState().beginTabRender(tabId, { preferredDimension: '3d' });

    store.getState().commitTabRenderError(tabId, {
      requestId,
      error: 'render failed',
      diagnostics: [],
    });
    expect(store.getState().tabs[0].render.status).toBe('error');

    store.getState().invalidateTabRender(tabId);
    const invalidated = store.getState().tabs[0].render;
    expect(invalidated.status).toBe('idle');
    expect(invalidated.requestId).toBe(requestId + 1);

    store.getState().clearTabRender(tabId);
    expect(store.getState().tabs[0].render).toEqual({
      ...createEmptyRenderState(),
      requestId: requestId + 1,
    });
  });

  it('supports selectors for active state and working directory', () => {
    const store = createWorkspaceStore({
      tabs: [
        createWorkspaceTab({
          id: 'tab-1',
          filePath: '/tmp/a.scad',
          name: 'a.scad',
        }),
        createWorkspaceTab({
          id: 'tab-2',
          filePath: '/tmp/nested/b.scad',
          name: 'b.scad',
        }),
      ],
      activeTabId: 'tab-2',
      showWelcome: false,
    });

    expect(selectActiveTab(store.getState())?.id).toBe('tab-2');
    expect(selectActiveRender(store.getState())).toEqual(createEmptyRenderState());
    expect(selectWorkingDirectory(store.getState())).toBe('/tmp/nested');
  });

  it('keeps active render selection isolated per tab', () => {
    const store = createWorkspaceStore({
      tabs: [
        createWorkspaceTab({
          id: 'tab-1',
          filePath: '/tmp/a.scad',
          name: 'a.scad',
        }),
        createWorkspaceTab({
          id: 'tab-2',
          filePath: '/tmp/b.scad',
          name: 'b.scad',
        }),
      ],
      activeTabId: 'tab-2',
      showWelcome: false,
    });

    const requestId = store.getState().beginTabRender('tab-1', { preferredDimension: '2d' });
    store.getState().commitTabRenderResult('tab-1', {
      requestId,
      previewSrc: 'blob:tab-1',
      previewKind: 'svg',
      diagnostics: [{ severity: 'warning', message: 'tab-1 warning' }],
      dimensionMode: '2d',
      lastRenderedContent: 'square([10, 10]);',
    });

    expect(selectActiveTab(store.getState())?.id).toBe('tab-2');
    expect(selectActiveRender(store.getState())).toEqual(createEmptyRenderState());

    store.getState().setActiveTab('tab-1');
    expect(selectActiveRender(store.getState())).toMatchObject({
      previewSrc: 'blob:tab-1',
      previewKind: 'svg',
      dimensionMode: '2d',
    });
  });
});
