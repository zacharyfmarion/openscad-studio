import type { PlatformBridge, PlatformCapabilities, FileOpenResult, FileFilter } from './types';
import {
  isOpenScadProjectFilePath,
  OPENSCAD_RENDERABLE_FILE_EXTENSIONS,
} from '../../../../packages/shared/src/openscadProjectFiles';

// File System Access API type declarations (not yet in standard DOM lib)
interface PickerAcceptType {
  description?: string;
  accept: Record<string, string[]>;
}

interface FilePickerOptions {
  types?: PickerAcceptType[];
  multiple?: boolean;
  suggestedName?: string;
}

interface FileSystemFileHandle {
  getFile(): Promise<File>;
  createWritable(): Promise<FileSystemWritableFileStream>;
  readonly name: string;
}

interface FileSystemWritableFileStream extends WritableStream {
  write(data: BufferSource | Blob | string): Promise<void>;
  close(): Promise<void>;
}

declare global {
  interface Window {
    showOpenFilePicker(options?: FilePickerOptions): Promise<FileSystemFileHandle[]>;
    showSaveFilePicker(options?: FilePickerOptions): Promise<FileSystemFileHandle>;
    __closeHandler?: () => Promise<boolean>;
  }
}

const capabilities: PlatformCapabilities = {
  multiFile: true,
  hasNativeMenu: false,
  hasFileSystem: false,
  canSetWindowTitle: true,
};

function filtersToAccept(filters?: FileFilter[]): string {
  if (!filters?.length) return '';
  return filters.flatMap((f) => f.extensions.map((ext) => `.${ext}`)).join(',');
}

function hasFileSystemAccess(): boolean {
  return 'showOpenFilePicker' in window;
}

export class WebBridge implements PlatformBridge {
  readonly capabilities = capabilities;
  private _hasDirtyState = false;

  setDirtyState(dirty: boolean): void {
    this._hasDirtyState = dirty;
  }

  async fileRead(): Promise<FileOpenResult | null> {
    return null;
  }

  async fileExists(): Promise<boolean> {
    return false;
  }

  async readTextFile(): Promise<string | null> {
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

  async writeTextFile(): Promise<void> {
    // Web: file writes happen in-memory via projectStore
  }

  async deleteFile(): Promise<void> {
    // Web: file deletes happen in-memory via projectStore
  }

  async renameFile(): Promise<void> {
    // Web: file renames happen in-memory via projectStore
  }

  async readSubdirectories(): Promise<string[]> {
    return [];
  }

  async createDirectory(): Promise<void> {
    // Web: directories are virtual — no filesystem to create them in
  }

  async removeDirectory(): Promise<void> {
    // Web: directories are virtual — no filesystem to remove from
  }

  async watchDirectory(): Promise<() => void> {
    // Web: no filesystem watching
    return () => {};
  }

  async getDefaultProjectsDirectory(): Promise<string | null> {
    return null;
  }

  async createProjectDirectory(): Promise<string | null> {
    return null;
  }

  async fileOpen(filters?: FileFilter[]): Promise<FileOpenResult | null> {
    if (hasFileSystemAccess()) {
      return this.fileOpenNative(filters);
    }
    return this.fileOpenFallback(filters);
  }

  private async fileOpenNative(filters?: FileFilter[]): Promise<FileOpenResult | null> {
    try {
      const types: PickerAcceptType[] = filters?.length
        ? filters.map((f) => ({
            description: f.name,
            accept: { 'text/plain': f.extensions.map((ext) => `.${ext}`) },
          }))
        : [];

      const [handle] = await window.showOpenFilePicker({
        types: types.length ? types : undefined,
        multiple: false,
      });

      const file = await handle.getFile();
      const content = await file.text();
      return { path: null, name: file.name, content };
    } catch {
      return null;
    }
  }

  private async fileOpenFallback(filters?: FileFilter[]): Promise<FileOpenResult | null> {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = filtersToAccept(filters);

      input.onchange = async () => {
        const file = input.files?.[0];
        if (!file) {
          resolve(null);
          return;
        }
        const content = await file.text();
        resolve({ path: null, name: file.name, content });
      };

      input.oncancel = () => resolve(null);
      input.click();
    });
  }

  async fileSave(
    content: string,
    _path?: string | null,
    filters?: FileFilter[],
    defaultFilename?: string
  ): Promise<string | null> {
    return this.fileSaveAs(content, filters, defaultFilename);
  }

  async fileSaveAs(
    content: string,
    filters?: FileFilter[],
    defaultFilename?: string
  ): Promise<string | null> {
    const filename = this.ensureExtension(defaultFilename || 'untitled', filters);
    if (hasFileSystemAccess()) {
      return this.fileSaveNative(content, filters, filename);
    }
    this.downloadFile(content, filename, 'text/plain');
    return filename;
  }

  private async fileSaveNative(
    content: string,
    filters?: FileFilter[],
    suggestedName?: string
  ): Promise<string | null> {
    try {
      const types: PickerAcceptType[] = filters?.length
        ? filters.map((f) => ({
            description: f.name,
            accept: { 'text/plain': f.extensions.map((ext) => `.${ext}`) },
          }))
        : [];

      const handle = await window.showSaveFilePicker({
        types: types.length ? types : undefined,
        suggestedName: suggestedName || 'untitled.scad',
      });

      const writable = await handle.createWritable();
      await writable.write(content);
      await writable.close();
      return handle.name;
    } catch {
      return null;
    }
  }

  async fileExport(
    data: Uint8Array,
    defaultFilename: string,
    filters?: FileFilter[]
  ): Promise<void> {
    void filters;
    const blob = new Blob([data], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = defaultFilename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  async confirm(message: string): Promise<boolean> {
    return window.confirm(message);
  }

  async ask(message: string): Promise<boolean> {
    return window.confirm(message);
  }

  setWindowTitle(): void {
    document.title = 'OpenSCAD Studio';
  }

  onCloseRequested(handler: () => Promise<boolean>): () => void {
    const hasDirty = () => this._hasDirtyState;
    const beforeUnload = (e: BeforeUnloadEvent) => {
      if (hasDirty()) {
        e.preventDefault();
        // Required by some browsers (Safari, legacy Chrome) to show the dialog
        e.returnValue = '';
      }
    };

    window.addEventListener('beforeunload', beforeUnload);
    window.__closeHandler = handler;

    return () => {
      window.removeEventListener('beforeunload', beforeUnload);
      delete window.__closeHandler;
    };
  }

  private ensureExtension(name: string, filters?: FileFilter[]): string {
    if (isOpenScadProjectFilePath(name)) {
      return name;
    }

    const primaryExtension =
      filters?.[0]?.extensions?.[0] ?? OPENSCAD_RENDERABLE_FILE_EXTENSIONS[0];
    const normalizedExtension = primaryExtension.startsWith('.')
      ? primaryExtension
      : `.${primaryExtension}`;

    return name.endsWith(normalizedExtension) ? name : `${name}${normalizedExtension}`;
  }

  private downloadFile(content: string, filename: string, mimeType: string): void {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}
