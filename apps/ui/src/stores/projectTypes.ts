export interface ProjectFile {
  /** File content (current editor state or last-read content) */
  content: string;
  /** Content as last saved to disk (or as loaded). Used for dirty detection. */
  savedContent: string;
  /** Whether the file has unsaved changes */
  isDirty: boolean;
  /** Whether this file exists only in memory (web virtual FS) vs. on disk */
  isVirtual: boolean;
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

  /** Change which file is the render target. No-op if the file doesn't exist. */
  setRenderTarget: (relativePath: string) => void;

  /** Reset the project to empty state. */
  resetProject: () => void;
}

export type ProjectStore = ProjectStoreState & ProjectStoreActions;
