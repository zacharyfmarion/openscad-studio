/**
 * Platform abstraction types for cross-platform support.
 * Enables the app to run as both a Tauri desktop app and a pure web app.
 */

export type ExportFormat = 'stl' | 'obj' | 'amf' | '3mf' | 'png' | 'svg' | 'dxf';

export interface FileOpenResult {
  /** File path on disk (null for web where no real path exists) */
  path: string | null;
  /** Display name for the file */
  name: string;
  /** File contents as text */
  content: string;
}

export interface PlatformCapabilities {
  /** Whether the platform supports multiple open files/tabs (Tauri=true, Web=false) */
  multiFile: boolean;
  /** Whether the platform has a native OS menu bar (Tauri=true, Web=false) */
  hasNativeMenu: boolean;
  /** Whether the platform has full filesystem access (Tauri=true, Web=limited) */
  hasFileSystem: boolean;
  /** Whether the platform can set the window title (both can) */
  canSetWindowTitle: boolean;
}

export interface ConfirmDialogOptions {
  title?: string;
  kind?: 'info' | 'warning' | 'error';
  okLabel?: string;
  cancelLabel?: string;
}

export interface FileFilter {
  name: string;
  extensions: string[];
}

export interface PlatformBridge {
  readonly capabilities: PlatformCapabilities;

  // -- File operations --

  /** Open a file. Returns null if user cancelled. */
  fileOpen(filters?: FileFilter[]): Promise<FileOpenResult | null>;

  /** Read a file by path. Only works on platforms with full filesystem access. */
  fileRead(path: string): Promise<FileOpenResult | null>;

  /**
   * Save content to a file.
   * If path is provided, saves directly (Tauri only). Otherwise prompts.
   * Returns the saved path, or null if cancelled.
   */
  fileSave(
    content: string,
    path?: string | null,
    filters?: FileFilter[],
    defaultFilename?: string
  ): Promise<string | null>;

  /** Always prompts for a new save location. Returns the saved path, or null if cancelled. */
  fileSaveAs(
    content: string,
    filters?: FileFilter[],
    defaultFilename?: string
  ): Promise<string | null>;

  /** Export binary data (e.g., STL, PNG). Prompts for save location on desktop, triggers download on web. */
  fileExport(data: Uint8Array, defaultFilename: string, filters?: FileFilter[]): Promise<void>;

  // -- Dialogs --

  /** Confirmation dialog (OK/Cancel). Returns true if confirmed. */
  confirm(message: string, options?: ConfirmDialogOptions): Promise<boolean>;

  /** Ask dialog with Save/Don't Save semantics. Returns true if user chose the affirmative action. */
  ask(message: string, options?: ConfirmDialogOptions): Promise<boolean>;

  // -- Window --

  /** Set the window/document title */
  setWindowTitle(title: string): void;

  /**
   * Register a handler for window close requests.
   * Handler should return true to allow close, false to prevent it.
   * Returns an unsubscribe function.
   */
  onCloseRequested(handler: () => Promise<boolean>): () => void;

  // -- Directory --

  /**
   * Check if a file exists at the given absolute path.
   * Web bridge always returns false.
   */
  fileExists(absolutePath: string): Promise<boolean>;

  /**
   * Read a single text file by absolute path.
   * Returns the file contents, or null if the file doesn't exist or can't be read.
   * Web bridge always returns null.
   */
  readTextFile(absolutePath: string): Promise<string | null>;

  /**
   * Read .scad files in a directory.
   * Returns a map of relative paths to file contents.
   * Used to populate the WASM virtual filesystem for include/use resolution.
   * @param recursive - If true (default), recursively walk subdirectories.
   *   Use false for working directory reads (only need sibling files).
   */
  readDirectoryFiles(dirPath: string, extensions?: string[], recursive?: boolean): Promise<Record<string, string>>;

  /**
   * Get well-known OS library paths that exist on disk.
   * Returns paths like ~/Documents/OpenSCAD/libraries/ on macOS.
   * Web bridge returns empty array (no filesystem access).
   */
  getLibraryPaths(): Promise<string[]>;

  /**
   * Open a directory picker dialog. Returns the selected path or null if cancelled.
   * Web bridge returns null (no filesystem access).
   */
  pickDirectory(): Promise<string | null>;

  // -- Lifecycle --

  /** Optional initialization (e.g., setting up native menu event forwarding) */
  initialize?(): Promise<void>;
}
