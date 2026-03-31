import { createProjectStore, computeOrphanedAncestors } from '../projectStore';
import { DEFAULT_TAB_NAME, DEFAULT_OPENSCAD_CODE } from '../workspaceFactories';

function createDesktopProject() {
  const store = createProjectStore();
  store.getState().openProject(
    '/Users/test/project',
    {
      'main.scad': 'cube(10);',
      'lib/utils.scad': 'module helper() { cube(5); }',
    },
    'main.scad'
  );
  return store;
}

function createVirtualProject() {
  const store = createProjectStore();
  store.getState().openProject(
    null,
    {
      'main.scad': 'sphere(5);',
    },
    'main.scad'
  );
  return store;
}

function createMultiFolderProject() {
  const store = createProjectStore();
  store.getState().openProject(
    '/Users/test/project',
    {
      'main.scad': 'include <lib/a.scad>',
      'lib/a.scad': '// a',
      'lib/sub/b.scad': '// b',
      'other/c.scad': '// c',
    },
    'main.scad'
  );
  return store;
}

describe('moveFolder', () => {
  it('moves all files under the folder to the new path', () => {
    const store = createMultiFolderProject();
    store.getState().moveFolder('lib', 'src/lib');

    const files = store.getState().files;
    expect(files['src/lib/a.scad']).toBeDefined();
    expect(files['src/lib/sub/b.scad']).toBeDefined();
    expect(files['lib/a.scad']).toBeUndefined();
    expect(files['lib/sub/b.scad']).toBeUndefined();
  });

  it('does not affect files outside the moved folder', () => {
    const store = createMultiFolderProject();
    store.getState().moveFolder('lib', 'src/lib');

    const files = store.getState().files;
    expect(files['main.scad']).toBeDefined();
    expect(files['other/c.scad']).toBeDefined();
  });

  it('updates renderTargetPath when the render target is inside the moved folder', () => {
    const store = createProjectStore();
    store.getState().openProject('/p', { 'lib/main.scad': 'cube(1);' }, 'lib/main.scad');

    store.getState().moveFolder('lib', 'src');

    expect(store.getState().renderTargetPath).toBe('src/main.scad');
  });

  it('does not change renderTargetPath when it is outside the moved folder', () => {
    const store = createMultiFolderProject();
    store.getState().moveFolder('lib', 'src');

    expect(store.getState().renderTargetPath).toBe('main.scad');
  });

  it('is a no-op when source and destination are the same path', () => {
    const store = createMultiFolderProject();
    const versionBefore = store.getState().contentVersion;

    store.getState().moveFolder('lib', 'lib');

    expect(store.getState().contentVersion).toBe(versionBefore);
    expect(store.getState().files['lib/a.scad']).toBeDefined();
  });

  it('is a no-op when destination is a descendant of source (cycle prevention)', () => {
    const store = createMultiFolderProject();
    const versionBefore = store.getState().contentVersion;

    store.getState().moveFolder('lib', 'lib/sub/nested');

    expect(store.getState().contentVersion).toBe(versionBefore);
    expect(store.getState().files['lib/a.scad']).toBeDefined();
  });

  it('preserves file content and dirty state after move', () => {
    const store = createProjectStore();
    store.getState().openProject('/p', { 'lib/f.scad': 'sphere(1);' }, 'lib/f.scad');
    // Mark dirty
    store.getState().updateFileContent('lib/f.scad', 'sphere(2);');
    expect(store.getState().files['lib/f.scad'].isDirty).toBe(true);

    store.getState().moveFolder('lib', 'src');

    const movedFile = store.getState().files['src/f.scad'];
    expect(movedFile).toBeDefined();
    expect(movedFile.content).toBe('sphere(2);');
    expect(movedFile.isDirty).toBe(true);
  });

  it('increments contentVersion', () => {
    const store = createMultiFolderProject();
    const versionBefore = store.getState().contentVersion;

    store.getState().moveFolder('lib', 'src');

    expect(store.getState().contentVersion).toBe(versionBefore + 1);
  });

  it('moves a subfolder to root level (App.tsx computes newFolderPath as folderName)', () => {
    // In App.tsx, when destFolderPath = '' (root), newFolderPath = folderName
    // So moveFolder is called with ("src/lib", "lib")
    const store = createProjectStore();
    store.getState().openProject('/p', { 'src/lib/f.scad': 'cube(1);' }, 'src/lib/f.scad');

    store.getState().moveFolder('src/lib', 'lib');

    const files = store.getState().files;
    expect(files['lib/f.scad']).toBeDefined();
    expect(files['src/lib/f.scad']).toBeUndefined();
  });
});

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

  it('clears emptyFolders', () => {
    const store = createDesktopProject();
    store.getState().addFolder('emptyDir');
    expect(store.getState().emptyFolders).toContain('emptyDir');

    store.getState().resetToUntitledProject();
    expect(store.getState().emptyFolders).toEqual([]);
  });
});

// ── addFolder ─────────────────────────────────────────────────────────────────

describe('addFolder', () => {
  it('adds a folder to emptyFolders', () => {
    const store = createDesktopProject();
    store.getState().addFolder('newDir');
    expect(store.getState().emptyFolders).toContain('newDir');
  });

  it('is a no-op if folder already has files underneath', () => {
    const store = createDesktopProject();
    store.getState().addFolder('lib');
    expect(store.getState().emptyFolders).not.toContain('lib');
  });

  it('is a no-op if folder is already tracked', () => {
    const store = createDesktopProject();
    store.getState().addFolder('emptyDir');
    store.getState().addFolder('emptyDir');
    expect(store.getState().emptyFolders.filter((f) => f === 'emptyDir')).toHaveLength(1);
  });
});

// ── removeFolder ──────────────────────────────────────────────────────────────

describe('removeFolder', () => {
  it('removes all files under the folder', () => {
    const store = createMultiFolderProject();
    store.getState().removeFolder('lib');

    const files = store.getState().files;
    expect(files['lib/a.scad']).toBeUndefined();
    expect(files['lib/sub/b.scad']).toBeUndefined();
    expect(files['main.scad']).toBeDefined();
    expect(files['other/c.scad']).toBeDefined();
  });

  it('removes the folder and sub-folders from emptyFolders', () => {
    const store = createProjectStore();
    store.getState().openProject('/p', { 'main.scad': 'cube(1);' }, 'main.scad');
    store.getState().addFolder('lib');
    store.getState().addFolder('lib/sub');
    expect(store.getState().emptyFolders).toEqual(['lib', 'lib/sub']);

    store.getState().removeFolder('lib');
    expect(store.getState().emptyFolders).toEqual([]);
  });

  it('updates renderTargetPath when render target is inside deleted folder', () => {
    const store = createProjectStore();
    store.getState().openProject(
      '/p',
      {
        'lib/main.scad': 'cube(1);',
        'other.scad': 'sphere(1);',
      },
      'lib/main.scad'
    );

    store.getState().removeFolder('lib');
    expect(store.getState().renderTargetPath).toBe('other.scad');
  });

  it('sets renderTargetPath to null when no files remain', () => {
    const store = createProjectStore();
    store.getState().openProject('/p', { 'lib/a.scad': '// a' }, 'lib/a.scad');

    store.getState().removeFolder('lib');
    expect(store.getState().renderTargetPath).toBeNull();
  });

  it('increments contentVersion', () => {
    const store = createMultiFolderProject();
    const versionBefore = store.getState().contentVersion;

    store.getState().removeFolder('lib');
    expect(store.getState().contentVersion).toBe(versionBefore + 1);
  });

  it('is safe to call on a nonexistent folder', () => {
    const store = createMultiFolderProject();
    const versionBefore = store.getState().contentVersion;

    store.getState().removeFolder('nope');
    // Still increments contentVersion (no special-case for empty result)
    expect(store.getState().contentVersion).toBe(versionBefore + 1);
    expect(Object.keys(store.getState().files)).toHaveLength(4);
  });
});

// ── addFile + emptyFolders interaction ────────────────────────────────────────

describe('addFile + emptyFolders interaction', () => {
  it('adding a file inside an empty folder removes it from emptyFolders', () => {
    const store = createDesktopProject();
    store.getState().addFolder('newDir');
    expect(store.getState().emptyFolders).toContain('newDir');

    store.getState().addFile('newDir/file.scad', '// file');
    expect(store.getState().emptyFolders).not.toContain('newDir');
  });

  it('adding a file in a nested path removes ancestor empty folders', () => {
    const store = createDesktopProject();
    store.getState().addFolder('a');
    store.getState().addFolder('a/b');
    expect(store.getState().emptyFolders).toEqual(['a', 'a/b']);

    store.getState().addFile('a/b/file.scad', '// file');
    // Both ancestors should be cleared since they now have file descendants
    expect(store.getState().emptyFolders).toEqual([]);
  });

  it('does not remove unrelated empty folders', () => {
    const store = createDesktopProject();
    store.getState().addFolder('dirA');
    store.getState().addFolder('dirB');

    store.getState().addFile('dirA/file.scad', '// file');
    expect(store.getState().emptyFolders).not.toContain('dirA');
    expect(store.getState().emptyFolders).toContain('dirB');
  });
});

// ── removeFile + emptyFolders interaction ─────────────────────────────────────

describe('removeFile + emptyFolders interaction', () => {
  it('removing the last file in a folder adds parent to emptyFolders', () => {
    const store = createProjectStore();
    store
      .getState()
      .openProject('/p', { 'lib/only.scad': '// only', 'main.scad': 'cube(1);' }, 'main.scad');

    store.getState().removeFile('lib/only.scad');
    expect(store.getState().emptyFolders).toContain('lib');
  });

  it('removing a file when siblings remain does NOT add parent to emptyFolders', () => {
    const store = createMultiFolderProject();
    // lib/ has lib/a.scad and lib/sub/b.scad
    store.getState().removeFile('lib/a.scad');
    expect(store.getState().emptyFolders).not.toContain('lib');
  });

  it('adds immediate parent but not grandparent (grandparent still has empty child)', () => {
    const store = createProjectStore();
    store.getState().openProject(
      '/p',
      {
        'a/b/deep.scad': '// deep',
        'root.scad': 'cube(1);',
      },
      'root.scad'
    );

    store.getState().removeFile('a/b/deep.scad');
    // a/b becomes empty, but a still has a/b as a visible child
    expect(store.getState().emptyFolders).toContain('a/b');
    expect(store.getState().emptyFolders).not.toContain('a');
  });

  it('stops walking up ancestors when a sibling exists', () => {
    const store = createProjectStore();
    store.getState().openProject(
      '/p',
      {
        'a/b/deep.scad': '// deep',
        'a/sibling.scad': '// sibling',
      },
      'a/sibling.scad'
    );

    store.getState().removeFile('a/b/deep.scad');
    // a/b becomes empty, but a still has a/sibling.scad so a should NOT be added
    expect(store.getState().emptyFolders).toContain('a/b');
    expect(store.getState().emptyFolders).not.toContain('a');
  });

  it('does not add root-level file parent to emptyFolders', () => {
    const store = createProjectStore();
    store
      .getState()
      .openProject('/p', { 'main.scad': 'cube(1);', 'other.scad': 'sphere(1);' }, 'main.scad');

    store.getState().removeFile('other.scad');
    expect(store.getState().emptyFolders).toEqual([]);
  });
});

// ── moveFolder + emptyFolders ─────────────────────────────────────────────────

describe('moveFolder + emptyFolders', () => {
  it('remaps empty sub-folders to the new path', () => {
    const store = createMultiFolderProject();
    store.getState().addFolder('lib/empty');

    store.getState().moveFolder('lib', 'src');
    expect(store.getState().emptyFolders).toContain('src/empty');
    expect(store.getState().emptyFolders).not.toContain('lib/empty');
  });

  it('remaps the folder itself if it was in emptyFolders', () => {
    const store = createDesktopProject();
    store.getState().addFolder('emptyDir');

    store.getState().moveFolder('emptyDir', 'renamedDir');
    expect(store.getState().emptyFolders).toContain('renamedDir');
    expect(store.getState().emptyFolders).not.toContain('emptyDir');
  });
});

// ── computeOrphanedAncestors ──────────────────────────────────────────────────

describe('computeOrphanedAncestors', () => {
  it('returns empty array for root-level files', () => {
    const result = computeOrphanedAncestors('main.scad', {}, []);
    expect(result).toEqual([]);
  });

  it('returns the parent folder when it has no remaining children', () => {
    const result = computeOrphanedAncestors('lib/file.scad', {}, []);
    expect(result).toEqual(['lib']);
  });

  it('returns nothing when parent still has files', () => {
    const files = { 'lib/other.scad': {} } as unknown as Record<
      string,
      import('../projectTypes').ProjectFile
    >;
    const result = computeOrphanedAncestors('lib/file.scad', files, []);
    expect(result).toEqual([]);
  });

  it('only adds the immediate parent when it has no other children', () => {
    const result = computeOrphanedAncestors('a/b/c/file.scad', {}, []);
    // Only a/b/c is added — a/b still has a/b/c as a visible (empty) child
    expect(result).toEqual(['a/b/c']);
  });

  it('stops when an ancestor has an existing empty subfolder', () => {
    const result = computeOrphanedAncestors('a/b/file.scad', {}, ['a/other']);
    expect(result).toEqual(['a/b']);
    // a should NOT be added because a/other is still there
  });
});
