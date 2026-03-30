import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';
import type { ProjectStore, ProjectStoreState, ProjectFile } from './projectTypes';

// ============================================================================
// Initial state
// ============================================================================

function createInitialProjectState(): ProjectStoreState {
  return {
    projectRoot: null,
    files: {},
    renderTargetPath: null,
    contentVersion: 0,
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
      });
    },

    addFile: (relativePath, content, options) => {
      const state = get();
      if (relativePath in state.files) return;

      set({
        files: {
          ...state.files,
          [relativePath]: createProjectFile(content, {
            isVirtual: options?.isVirtual ?? state.projectRoot === null,
            isDirty: true,
          }),
        },
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

      set(updates);
    },

    setRenderTarget: (relativePath) => {
      const state = get();
      if (!(relativePath in state.files)) return;
      set({ renderTargetPath: relativePath });
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
