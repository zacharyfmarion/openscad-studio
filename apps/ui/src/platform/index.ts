export type {
  PlatformBridge,
  PlatformCapabilities,
  FileOpenResult,
  FileFilter,
  ConfirmDialogOptions,
  ExportFormat,
} from './types';
export { eventBus } from './eventBus';
export type { EventMap } from './eventBus';
export { historyService } from './historyService';
export type { EditorCheckpoint, CheckpointDiff, Diagnostic, ChangeType } from './historyService';

import type {
  ConfirmDialogOptions,
  FileFilter,
  FileOpenResult,
  PlatformBridge,
  PlatformCapabilities,
} from './types';

let _bridge: PlatformBridge | null = null;

function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

function createBootstrapCapabilities(): PlatformCapabilities {
  return isTauri()
    ? {
        multiFile: true,
        hasNativeMenu: true,
        hasFileSystem: true,
        canSetWindowTitle: true,
      }
    : {
        multiFile: true,
        hasNativeMenu: false,
        hasFileSystem: false,
        canSetWindowTitle: true,
      };
}

class BootstrapBridge implements PlatformBridge {
  readonly capabilities = createBootstrapCapabilities();

  async fileOpen(filters?: FileFilter[]): Promise<FileOpenResult | null> {
    void filters;
    return null;
  }

  async fileRead(path: string): Promise<FileOpenResult | null> {
    void path;
    return null;
  }

  async fileSave(
    content: string,
    path?: string | null,
    filters?: FileFilter[],
    defaultFilename?: string
  ): Promise<string | null> {
    void content;
    void path;
    void filters;
    void defaultFilename;
    return null;
  }

  async fileSaveAs(
    content: string,
    filters?: FileFilter[],
    defaultFilename?: string
  ): Promise<string | null> {
    void content;
    void filters;
    void defaultFilename;
    return null;
  }

  async fileExport(
    data: Uint8Array,
    defaultFilename: string,
    filters?: FileFilter[]
  ): Promise<void> {
    void data;
    void defaultFilename;
    void filters;
  }

  async confirm(message: string, options?: ConfirmDialogOptions): Promise<boolean> {
    void options;
    return window.confirm(message);
  }

  async ask(message: string, options?: ConfirmDialogOptions): Promise<boolean> {
    void options;
    return window.confirm(message);
  }

  setWindowTitle(title: string): void {
    document.title = title;
  }

  private _hasDirtyState = false;

  setDirtyState(dirty: boolean): void {
    this._hasDirtyState = dirty;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  onCloseRequested(_handler: () => Promise<boolean>): () => void {
    const hasDirty = () => this._hasDirtyState;
    const beforeUnload = (e: BeforeUnloadEvent) => {
      if (hasDirty()) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => {
      window.removeEventListener('beforeunload', beforeUnload);
    };
  }

  async fileExists(absolutePath: string): Promise<boolean> {
    void absolutePath;
    return false;
  }

  async readTextFile(absolutePath: string): Promise<string | null> {
    void absolutePath;
    return null;
  }

  async readDirectoryFiles(): Promise<Record<string, string>> {
    return {};
  }

  async getLibraryPaths(): Promise<string[]> {
    return [];
  }

  async pickDirectory(): Promise<string | null> {
    return null;
  }

  async writeTextFile(): Promise<void> {}
  async deleteFile(): Promise<void> {}
  async renameFile(): Promise<void> {}
  async readSubdirectories(): Promise<string[]> {
    return [];
  }
  async createDirectory(): Promise<void> {}
  async removeDirectory(): Promise<void> {}
  async watchDirectory(): Promise<() => void> {
    return () => {};
  }
  async getDefaultProjectsDirectory(): Promise<string | null> {
    return null;
  }
  async createProjectDirectory(): Promise<string | null> {
    return null;
  }
}

const bootstrapBridge = new BootstrapBridge();

export async function initializePlatform(): Promise<PlatformBridge> {
  if (_bridge) {
    return _bridge;
  }

  if (isTauri()) {
    const { TauriBridge } = await import('./tauriBridge');
    _bridge = new TauriBridge();
  } else {
    const { WebBridge } = await import('./webBridge');
    _bridge = new WebBridge();
  }

  if (_bridge.initialize) {
    await _bridge.initialize();
  }

  return _bridge;
}

export function getPlatform(): PlatformBridge {
  return _bridge ?? bootstrapBridge;
}
