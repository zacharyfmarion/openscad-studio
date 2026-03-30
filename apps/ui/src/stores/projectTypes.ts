export interface ProjectFile {
  /** File content (current editor state or last-read content) */
  content: string;
  /** Content as last saved to disk (or as loaded). Used for dirty detection. */
  savedContent: string;
  /** Whether the file has unsaved changes */
  isDirty: boolean;
  /** Whether this file exists only in memory (web virtual FS) vs. on disk */
  isVirtual: boolean;
  /** Baseline content for the customizer panel (reset-to snapshot). */
  customizerBaseContent: string;
}

export interface ProjectStoreState {
  /**
   * Absolute path to the project root directory.
   * Desktop: parent directory of the opened file (or picked folder).
   * Web: null (no real filesystem).
   */
  projectRoot: string | null;

  /**
   * All files in the project, keyed by relative path (e.g., "main.scad", "lib/utils.scad").
   */
  files: Record<string, ProjectFile>;

  /**
   * Relative path of the file that the preview renders.
   * This is the "entry point" — include/use deps are resolved from this file.
   */
  renderTargetPath: string | null;

  /**
   * Monotonically increasing counter, bumped on every file content mutation.
   * Used by the render pipeline to detect dependency changes (e.g. editing an
   * included file that isn't the render target).
   */
  contentVersion: number;
}

export interface ProjectStoreActions {
  /**
   * Initialize a project with a set of files and a render target.
   * Replaces any existing project state.
   */
  openProject: (
    root: string | null,
    files: Record<string, string>,
    renderTargetPath: string
  ) => void;

  /** Add a new file to the project. No-op if the path already exists. */
  addFile: (relativePath: string, content: string, options?: { isVirtual?: boolean }) => void;

  /** Update the content of an existing file. No-op if the file doesn't exist. */
  updateFileContent: (relativePath: string, content: string) => void;

  /** Mark a file as saved (syncs savedContent to current content). */
  markFileSaved: (relativePath: string, savedContent?: string) => void;

  /** Remove a file from the project. */
  removeFile: (relativePath: string) => void;

  /** Rename a file within the project. No-op if oldPath doesn't exist or newPath already exists. */
  renameFile: (oldPath: string, newPath: string) => void;

  /** Change which file is the render target. No-op if the file doesn't exist. */
  setRenderTarget: (relativePath: string) => void;

  /** Revert a file to its last saved content, clearing dirty state. */
  revertFile: (relativePath: string) => void;

  /** Update the customizer baseline content for a file. */
  setCustomizerBase: (relativePath: string, content: string) => void;

  /** Reset the project to empty state. */
  resetProject: () => void;
}

export type ProjectStore = ProjectStoreState & ProjectStoreActions;
