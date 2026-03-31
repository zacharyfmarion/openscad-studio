import { createProjectStore } from '../projectStore';
import { DEFAULT_TAB_NAME, DEFAULT_OPENSCAD_CODE } from '../workspaceFactories';

function createDesktopProject() {
  const store = createProjectStore();
  store.getState().openProject('/Users/test/project', {
    'main.scad': 'cube(10);',
    'lib/utils.scad': 'module helper() { cube(5); }',
  }, 'main.scad');
  return store;
}

function createVirtualProject() {
  const store = createProjectStore();
  store.getState().openProject(null, {
    'main.scad': 'sphere(5);',
  }, 'main.scad');
  return store;
}

describe('resetToUntitledProject', () => {
  it('resets a desktop project to a clean virtual untitled state', () => {
    const store = createDesktopProject();
    const versionBefore = store.getState().contentVersion;

    store.getState().resetToUntitledProject();

    const state = store.getState();
    expect(state.projectRoot).toBeNull();
    expect(Object.keys(state.files)).toEqual([DEFAULT_TAB_NAME]);
    expect(state.files[DEFAULT_TAB_NAME].isVirtual).toBe(true);
    expect(state.files[DEFAULT_TAB_NAME].isDirty).toBe(false);
    expect(state.files[DEFAULT_TAB_NAME].content).toBe(DEFAULT_OPENSCAD_CODE);
    expect(state.renderTargetPath).toBe(DEFAULT_TAB_NAME);
    expect(state.contentVersion).toBe(versionBefore + 1);
  });

  it('resets a virtual project to a clean untitled state', () => {
    const store = createVirtualProject();

    store.getState().resetToUntitledProject();

    const state = store.getState();
    expect(state.projectRoot).toBeNull();
    expect(Object.keys(state.files)).toEqual([DEFAULT_TAB_NAME]);
    expect(state.files[DEFAULT_TAB_NAME].content).toBe(DEFAULT_OPENSCAD_CODE);
    expect(state.renderTargetPath).toBe(DEFAULT_TAB_NAME);
  });

  it('clears all previous files', () => {
    const store = createDesktopProject();
    expect(Object.keys(store.getState().files)).toHaveLength(2);

    store.getState().resetToUntitledProject();

    expect(Object.keys(store.getState().files)).toHaveLength(1);
    expect(store.getState().files['main.scad']).toBeUndefined();
    expect(store.getState().files['lib/utils.scad']).toBeUndefined();
  });

  it('produces a consistent state when called multiple times', () => {
    const store = createDesktopProject();

    store.getState().resetToUntitledProject();
    const first = { ...store.getState() };

    store.getState().resetToUntitledProject();
    const second = store.getState();

    expect(second.projectRoot).toBe(first.projectRoot);
    expect(Object.keys(second.files)).toEqual(Object.keys(first.files));
    expect(second.renderTargetPath).toBe(first.renderTargetPath);
    expect(second.contentVersion).toBe(first.contentVersion + 1);
  });
});
