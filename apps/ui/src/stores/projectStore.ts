import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';
import type { ProjectStore, ProjectStoreState, ProjectFile } from './projectTypes';
import { DEFAULT_TAB_NAME, DEFAULT_OPENSCAD_CODE } from './workspaceFactories';

// ============================================================================
// Initial state
// ============================================================================

function createInitialProjectState(): ProjectStoreState {
  return {
    projectRoot: null,
    files: {},
    renderTargetPath: null,
    contentVersion: 0,
    emptyFolders: [],
  };
}

function createProjectFile(
  content: string,
  options?: { isVirtual?: boolean; isDirty?: boolean }
): ProjectFile {
  return {
    content,
    savedContent: content,
    isDirty: options?.isDirty ?? false,
    isVirtual: options?.isVirtual ?? false,
    customizerBaseContent: content,
  };
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Walk up the parent chain from a removed file path, returning ancestor folder
 * paths that have no remaining children (files or tracked empty sub-folders).
 */
export function computeOrphanedAncestors(
  removedPath: string,
  files: Record<string, ProjectFile>,
  emptyFolders: string[]
): string[] {
  const added: string[] = [];
  let dir = removedPath.includes('/') ? removedPath.substring(0, removedPath.lastIndexOf('/')) : '';
  while (dir) {
    const prefix = dir + '/';
    const hasFiles = Object.keys(files).some((p) => p.startsWith(prefix));
    const hasSubFolders = emptyFolders.some((f) => f.startsWith(prefix) && f !== dir);
    const alsoAdded = added.some((a) => a.startsWith(prefix));
    if (hasFiles || hasSubFolders || alsoAdded) break;
    if (!emptyFolders.includes(dir)) added.push(dir);
    dir = dir.includes('/') ? dir.substring(0, dir.lastIndexOf('/')) : '';
  }
  return added;
}

// ============================================================================
// Store
// ============================================================================

export function createProjectStore(initialState?: ProjectStoreState) {
  return createStore<ProjectStore>()((set, get) => ({
    ...(initialState ?? createInitialProjectState()),

    openProject: (root, files, renderTargetPath) => {
      const projectFiles: Record<string, ProjectFile> = {};
      for (const [path, content] of Object.entries(files)) {
        projectFiles[path] = createProjectFile(content, { isVirtual: root === null });
      }

      set({
        projectRoot: root,
        files: projectFiles,
        renderTargetPath,
        contentVersion: get().contentVersion + 1,
        emptyFolders: [],
      });
    },

    addFile: (relativePath, content, options) => {
      const state = get();
      if (relativePath in state.files) return;

      const isVirtual = options?.isVirtual ?? state.projectRoot === null;
      // Remove any empty folder ancestors that this file now makes non-empty
      const newEmptyFolders = state.emptyFolders.filter((f) => !relativePath.startsWith(f + '/'));
      set({
        files: {
          ...state.files,
          [relativePath]: createProjectFile(content, {
            isVirtual,
            isDirty: true,
          }),
        },
        emptyFolders: newEmptyFolders,
        contentVersion: state.contentVersion + 1,
      });
    },

    updateFileContent: (relativePath, content) => {
      const state = get();
      const file = state.files[relativePath];
      if (!file || file.content === content) return;

      set({
        files: {
          ...state.files,
          [relativePath]: {
            ...file,
            content,
            isDirty: content !== file.savedContent,
          },
        },
        contentVersion: state.contentVersion + 1,
      });
    },

    markFileSaved: (relativePath, savedContent) => {
      const state = get();
      const file = state.files[relativePath];
      if (!file) return;

      const nextSavedContent = savedContent ?? file.content;
      set({
        files: {
          ...state.files,
          [relativePath]: {
            ...file,
            savedContent: nextSavedContent,
            isDirty: file.content !== nextSavedContent,
          },
        },
      });
    },

    removeFile: (relativePath) => {
      const state = get();
      if (!(relativePath in state.files)) return;

      const rest = { ...state.files };
      delete rest[relativePath];
      const updates: Partial<ProjectStoreState> = { files: rest };

      // If we removed the render target, promote another file
      if (state.renderTargetPath === relativePath) {
        const remaining = Object.keys(rest);
        updates.renderTargetPath = remaining.length > 0 ? remaining[0] : null;
      }

      // Persist parent folders that just became empty
      const orphaned = computeOrphanedAncestors(relativePath, rest, state.emptyFolders);
      if (orphaned.length > 0) {
        updates.emptyFolders = [...state.emptyFolders, ...orphaned];
      }

      set(updates);
    },

    renameFile: (oldPath, newPath) => {
      const state = get();
      if (!(oldPath in state.files) || newPath in state.files) return;

      const rest = { ...state.files };
      const file = rest[oldPath];
      delete rest[oldPath];
      rest[newPath] = file;

      const updates: Partial<ProjectStoreState> = {
        files: rest,
        contentVersion: state.contentVersion + 1,
      };
      if (state.renderTargetPath === oldPath) {
        updates.renderTargetPath = newPath;
      }
      set(updates);
    },

    setRenderTarget: (relativePath) => {
      const state = get();
      if (!(relativePath in state.files)) return;
      set({ renderTargetPath: relativePath, contentVersion: state.contentVersion + 1 });
    },

    revertFile: (relativePath) => {
      const state = get();
      const file = state.files[relativePath];
      if (!file || !file.isDirty) return;

      set({
        files: {
          ...state.files,
          [relativePath]: {
            ...file,
            content: file.savedContent,
            isDirty: false,
          },
        },
        contentVersion: state.contentVersion + 1,
      });
    },

    setCustomizerBase: (relativePath, content) => {
      const state = get();
      const file = state.files[relativePath];
      if (!file) return;

      set({
        files: {
          ...state.files,
          [relativePath]: {
            ...file,
            customizerBaseContent: content,
          },
        },
      });
    },

    resetProject: () => {
      set(createInitialProjectState());
    },

    resetToUntitledProject: () => {
      set({
        projectRoot: null,
        files: {
          [DEFAULT_TAB_NAME]: createProjectFile(DEFAULT_OPENSCAD_CODE, { isVirtual: true }),
        },
        renderTargetPath: DEFAULT_TAB_NAME,
        contentVersion: get().contentVersion + 1,
        emptyFolders: [],
      });
    },

    moveFolder: (oldFolderPath, newFolderPath) => {
      // Guard: no-op if same path or destination is a descendant of source
      if (newFolderPath === oldFolderPath) return;
      if (newFolderPath.startsWith(oldFolderPath + '/')) return;

      const state = get();
      const prefix = oldFolderPath + '/';
      const newFiles: typeof state.files = {};

      for (const [path, file] of Object.entries(state.files)) {
        if (path.startsWith(prefix)) {
          const newPath = newFolderPath + '/' + path.slice(prefix.length);
          newFiles[newPath] = file;
        } else {
          newFiles[path] = file;
        }
      }

      let newRenderTargetPath = state.renderTargetPath;
      if (state.renderTargetPath?.startsWith(prefix)) {
        newRenderTargetPath = newFolderPath + '/' + state.renderTargetPath.slice(prefix.length);
      }

      // Remap emptyFolders under the moved folder
      const newEmptyFolders = state.emptyFolders.map((f) => {
        if (f === oldFolderPath) return newFolderPath;
        if (f.startsWith(prefix)) return newFolderPath + '/' + f.slice(prefix.length);
        return f;
      });

      set({
        files: newFiles,
        renderTargetPath: newRenderTargetPath,
        emptyFolders: newEmptyFolders,
        contentVersion: state.contentVersion + 1,
      });
    },

    addFolder: (relativePath) => {
      const state = get();
      // No-op if folder already has files underneath
      const prefix = relativePath + '/';
      if (Object.keys(state.files).some((p) => p.startsWith(prefix))) return;
      // No-op if already tracked
      if (state.emptyFolders.includes(relativePath)) return;
      set({ emptyFolders: [...state.emptyFolders, relativePath] });
    },

    removeFolder: (folderPath) => {
      const state = get();
      const prefix = folderPath + '/';

      // Remove all files under this folder
      const newFiles = { ...state.files };
      for (const path of Object.keys(newFiles)) {
        if (path.startsWith(prefix)) {
          delete newFiles[path];
        }
      }

      // Remove this folder and any sub-folders from emptyFolders
      const newEmptyFolders = state.emptyFolders.filter(
        (f) => f !== folderPath && !f.startsWith(prefix)
      );

      // Handle render target
      let newRenderTarget = state.renderTargetPath;
      if (newRenderTarget && newRenderTarget.startsWith(prefix)) {
        const remaining = Object.keys(newFiles);
        newRenderTarget = remaining.length > 0 ? remaining[0] : null;
      }

      set({
        files: newFiles,
        emptyFolders: newEmptyFolders,
        renderTargetPath: newRenderTarget,
        contentVersion: state.contentVersion + 1,
      });
    },
  }));
}

// ============================================================================
// Singleton instance + React hook
// ============================================================================

const projectStoreInstance = createProjectStore();

export function getProjectState(): ProjectStoreState {
  return projectStoreInstance.getState();
}

export function getProjectStore() {
  return projectStoreInstance;
}

export function useProjectStore<T>(selector: (state: ProjectStore) => T): T {
  return useStore(projectStoreInstance, selector);
}

// ============================================================================
// Derived helpers (pure functions over state)
// ============================================================================

/**
 * Get all project files as a `Record<string, string>` suitable for the WASM
 * worker's `auxiliaryFiles` parameter. Excludes the render target since that
 * file is sent as the primary input.
 */
export function getAuxiliaryFilesForRender(state: ProjectStoreState): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [path, file] of Object.entries(state.files)) {
    if (path !== state.renderTargetPath) {
      result[path] = file.content;
    }
  }
  return result;
}

/**
 * Get the content of the current render target file, or null if none is set.
 */
export function getRenderTargetContent(state: ProjectStoreState): string | null {
  if (!state.renderTargetPath) return null;
  return state.files[state.renderTargetPath]?.content ?? null;
}

/**
 * List all file paths in the project, sorted alphabetically.
 */
export function listProjectFiles(state: ProjectStoreState): string[] {
  return Object.keys(state.files).sort((a, b) => a.localeCompare(b));
}

/**
 * Derive the working directory from the project root.
 * For desktop projects this is the projectRoot itself.
 * For web (projectRoot === null) this returns null.
 */
export function getProjectWorkingDirectory(state: ProjectStoreState): string | null {
  return state.projectRoot;
}
