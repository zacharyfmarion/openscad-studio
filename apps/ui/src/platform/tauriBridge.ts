import type {
  PlatformBridge,
  PlatformCapabilities,
  FileOpenResult,
  FileFilter,
  ConfirmDialogOptions,
} from './types';
import { eventBus } from './eventBus';

const capabilities: PlatformCapabilities = {
  multiFile: true,
  hasNativeMenu: true,
  hasFileSystem: true,
  canSetWindowTitle: true,
};

export class TauriBridge implements PlatformBridge {
  readonly capabilities = capabilities;

  async fileOpen(filters?: FileFilter[]): Promise<FileOpenResult | null> {
    const { open } = await import('@tauri-apps/plugin-dialog');
    const { readTextFile } = await import('@tauri-apps/plugin-fs');

    const selected = await open({
      filters,
      multiple: false,
    });

    if (!selected) return null;

    const filePath = typeof selected === 'string' ? selected : (selected as { path: string }).path;
    const content = await readTextFile(filePath);
    const name = filePath.split('/').pop() || filePath;

    return { path: filePath, name, content };
  }

  async fileRead(path: string): Promise<FileOpenResult | null> {
    const { readTextFile } = await import('@tauri-apps/plugin-fs');
    const content = await readTextFile(path);
    const name = path.split('/').pop() || path;
    return { path, name, content };
  }

  async fileSave(
    content: string,
    path?: string | null,
    filters?: FileFilter[],
    defaultFilename?: string
  ): Promise<string | null> {
    if (path) {
      const { writeTextFile } = await import('@tauri-apps/plugin-fs');
      await writeTextFile(path, content);
      return path;
    }

    return this.fileSaveAs(content, filters, defaultFilename);
  }

  async fileSaveAs(
    content: string,
    filters?: FileFilter[],
    defaultFilename?: string
  ): Promise<string | null> {
    const { save } = await import('@tauri-apps/plugin-dialog');
    const { writeTextFile } = await import('@tauri-apps/plugin-fs');

    const savePath = await save({ filters, defaultPath: defaultFilename });
    if (!savePath) return null;

    await writeTextFile(savePath, content);
    return savePath;
  }

  async fileExport(
    data: Uint8Array,
    _defaultFilename: string,
    filters?: FileFilter[]
  ): Promise<void> {
    const { save } = await import('@tauri-apps/plugin-dialog');
    const { writeFile } = await import('@tauri-apps/plugin-fs');

    const savePath = await save({ filters });
    if (!savePath) return;

    await writeFile(savePath, data);
  }

  async confirm(message: string, options?: ConfirmDialogOptions): Promise<boolean> {
    const { confirm } = await import('@tauri-apps/plugin-dialog');
    return confirm(message, {
      title: options?.title,
      kind: options?.kind,
      okLabel: options?.okLabel,
      cancelLabel: options?.cancelLabel,
    });
  }

  async ask(message: string, options?: ConfirmDialogOptions): Promise<boolean> {
    const { ask } = await import('@tauri-apps/plugin-dialog');
    return ask(message, {
      title: options?.title,
      kind: options?.kind,
      okLabel: options?.okLabel,
      cancelLabel: options?.cancelLabel,
    });
  }

  async fileExists(absolutePath: string): Promise<boolean> {
    try {
      const { exists } = await import('@tauri-apps/plugin-fs');
      return await exists(absolutePath);
    } catch {
      return false;
    }
  }

  async readTextFile(absolutePath: string): Promise<string | null> {
    try {
      const { readTextFile } = await import('@tauri-apps/plugin-fs');
      return await readTextFile(absolutePath);
    } catch {
      return null;
    }
  }

  async readDirectoryFiles(
    dirPath: string,
    extensions: string[] = ['scad'],
    recursive: boolean = true
  ): Promise<Record<string, string>> {
    const { readDir, readTextFile } = await import('@tauri-apps/plugin-fs');
    const files: Record<string, string> = {};

    const walk = async (currentDir: string, prefix: string) => {
      let entries;
      try {
        entries = await readDir(currentDir);
      } catch (err) {
        console.warn(`[readDirectoryFiles] Failed to read directory ${currentDir}:`, err);
        return;
      }
      for (const entry of entries) {
        // Skip hidden files/directories (e.g. .git)
        if (entry.name.startsWith('.')) continue;

        const entryPath = currentDir + '/' + entry.name;
        const relativePath = prefix ? prefix + '/' + entry.name : entry.name;

        if (entry.isDirectory) {
          if (recursive) {
            await walk(entryPath, relativePath);
          }
        } else if (extensions.some((ext) => entry.name.endsWith('.' + ext))) {
          try {
            files[relativePath] = await readTextFile(entryPath);
          } catch (err) {
            console.warn(`[readDirectoryFiles] Failed to read file ${entryPath}:`, err);
          }
        }
      }
    };

    try {
      await walk(dirPath, '');
    } catch {
      // Directory doesn't exist or can't be read
    }

    return files;
  }

  async getLibraryPaths(): Promise<string[]> {
    try {
      const { homeDir, join } = await import('@tauri-apps/api/path');
      const { exists } = await import('@tauri-apps/plugin-fs');
      const home = await homeDir();

      // Well-known OS library paths for OpenSCAD
      const candidates: string[] = [];
      const platformLower = navigator.platform.toLowerCase();

      if (platformLower.includes('mac') || platformLower.includes('darwin')) {
        candidates.push(await join(home, 'Documents', 'OpenSCAD', 'libraries'));
      } else if (platformLower.includes('win')) {
        candidates.push(await join(home, 'Documents', 'OpenSCAD', 'libraries'));
      } else {
        candidates.push(await join(home, '.local', 'share', 'OpenSCAD', 'libraries'));
      }

      const validPaths: string[] = [];
      for (const p of candidates) {
        try {
          if (await exists(p)) {
            validPaths.push(p);
          }
        } catch {
          // Path doesn't exist or can't be accessed
        }
      }

      return validPaths;
    } catch (err) {
      console.error('[getLibraryPaths] Error:', err);
      return [];
    }
  }

  async pickDirectory(): Promise<string | null> {
    const { open } = await import('@tauri-apps/plugin-dialog');
    const selected = await open({
      directory: true,
      multiple: false,
    });
    if (!selected) return null;
    return typeof selected === 'string' ? selected : (selected as { path: string }).path;
  }

  async writeTextFile(absolutePath: string, content: string): Promise<void> {
    const { writeTextFile } = await import('@tauri-apps/plugin-fs');
    await writeTextFile(absolutePath, content);
  }

  async deleteFile(absolutePath: string): Promise<void> {
    const { remove } = await import('@tauri-apps/plugin-fs');
    await remove(absolutePath);
  }

  async renameFile(oldPath: string, newPath: string): Promise<void> {
    const { rename } = await import('@tauri-apps/plugin-fs');
    await rename(oldPath, newPath);
  }

  setWindowTitle(title: string): void {
    import('@tauri-apps/api/window').then(({ getCurrentWindow }) => {
      getCurrentWindow().setTitle(title);
    });
  }

  onCloseRequested(handler: () => Promise<boolean>): () => void {
    let unlisten: (() => void) | null = null;

    import('@tauri-apps/api/window').then(({ getCurrentWindow }) => {
      const appWindow = getCurrentWindow();
      appWindow
        .onCloseRequested(async (event) => {
          const allowClose = await handler();
          if (!allowClose) {
            event.preventDefault();
          }
        })
        .then((fn) => {
          unlisten = fn;
        });
    });

    return () => {
      if (unlisten) unlisten();
    };
  }

  async initialize(): Promise<void> {
    const { listen } = await import('@tauri-apps/api/event');

    await listen('menu:file:new', () => eventBus.emit('menu:file:new'));
    await listen('menu:file:open', () => eventBus.emit('menu:file:open'));
    await listen('menu:file:save', () => eventBus.emit('menu:file:save'));
    await listen('menu:file:save_as', () => eventBus.emit('menu:file:save_as'));
    await listen<string>('menu:file:export', (event) => {
      eventBus.emit('menu:file:export', event.payload as import('./types').ExportFormat);
    });
  }
}
