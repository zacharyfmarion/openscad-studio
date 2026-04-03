import type {
  PlatformBridge,
  PlatformCapabilities,
  FileOpenResult,
  FileFilter,
  ConfirmDialogOptions,
} from './types';
import { eventBus } from './eventBus';
import {
  OPENSCAD_PROJECT_FILE_EXTENSIONS,
  hasAllowedExtension,
  isOpenScadProjectFilePath,
} from '../../../../packages/shared/src/openscadProjectFiles';

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
    extensions: string[] = [...OPENSCAD_PROJECT_FILE_EXTENSIONS],
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
        } else if (hasAllowedExtension(entry.name, extensions)) {
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

  async readSubdirectories(dirPath: string): Promise<string[]> {
    const { readDir } = await import('@tauri-apps/plugin-fs');
    const dirs: string[] = [];

    const walk = async (currentDir: string, prefix: string) => {
      let entries;
      try {
        entries = await readDir(currentDir);
      } catch {
        return;
      }
      for (const entry of entries) {
        if (entry.name.startsWith('.')) continue;
        if (entry.isDirectory) {
          const relativePath = prefix ? prefix + '/' + entry.name : entry.name;
          dirs.push(relativePath);
          await walk(currentDir + '/' + entry.name, relativePath);
        }
      }
    };

    try {
      await walk(dirPath, '');
    } catch {
      // Directory doesn't exist or can't be read
    }

    return dirs;
  }

  async createDirectory(absolutePath: string): Promise<void> {
    const { mkdir } = await import('@tauri-apps/plugin-fs');
    await mkdir(absolutePath, { recursive: true });
  }

  async removeDirectory(absolutePath: string): Promise<void> {
    const { remove } = await import('@tauri-apps/plugin-fs');
    await remove(absolutePath, { recursive: true });
  }

  async watchDirectory(
    dirPath: string,
    onChange: (relativePath: string, content: string | null) => void
  ): Promise<() => void> {
    const { watch } = await import('@tauri-apps/plugin-fs');
    const { readTextFile } = await import('@tauri-apps/plugin-fs');

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const pendingPaths = new Set<string>();

    const unwatch = await watch(
      dirPath,
      (event) => {
        // event can be a single event or batch
        const events = Array.isArray(event) ? event : [event];
        for (const e of events) {
          if (typeof e.type === 'object' && ('modify' in e.type || 'create' in e.type)) {
            for (const path of e.paths) {
              if (isOpenScadProjectFilePath(path)) {
                // Convert absolute path to relative
                const relative = path.startsWith(dirPath + '/')
                  ? path.slice(dirPath.length + 1)
                  : path.startsWith(dirPath)
                    ? path.slice(dirPath.length)
                    : null;
                if (relative) pendingPaths.add(relative);
              }
            }
          }
          if (typeof e.type === 'object' && 'remove' in e.type) {
            for (const path of e.paths) {
              if (isOpenScadProjectFilePath(path)) {
                const relative = path.startsWith(dirPath + '/')
                  ? path.slice(dirPath.length + 1)
                  : path.startsWith(dirPath)
                    ? path.slice(dirPath.length)
                    : null;
                if (relative) {
                  pendingPaths.delete(relative);
                  onChange(relative, null);
                }
              }
            }
          }
        }

        // Debounce 300ms to batch rapid edits
        if (pendingPaths.size > 0) {
          if (debounceTimer) clearTimeout(debounceTimer);
          debounceTimer = setTimeout(async () => {
            const paths = [...pendingPaths];
            pendingPaths.clear();
            for (const relPath of paths) {
              try {
                const content = await readTextFile(`${dirPath}/${relPath}`);
                onChange(relPath, content);
              } catch {
                // File may have been deleted between event and read
                onChange(relPath, null);
              }
            }
          }, 300);
        }
      },
      { recursive: true }
    );

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      unwatch();
    };
  }

  async getDefaultProjectsDirectory(): Promise<string | null> {
    try {
      const { documentDir, join } = await import('@tauri-apps/api/path');
      const docs = await documentDir();
      return await join(docs, 'OpenSCAD Studio');
    } catch (err) {
      console.error('[getDefaultProjectsDirectory] Error:', err);
      return null;
    }
  }

  async createProjectDirectory(basePath: string, name: string): Promise<string | null> {
    try {
      const { mkdir, exists } = await import('@tauri-apps/plugin-fs');

      // Ensure base directory exists
      await mkdir(basePath, { recursive: true });

      // Deduplicate name
      let candidate = `${basePath}/${name}`;
      let suffix = 1;
      while (await exists(candidate)) {
        suffix++;
        candidate = `${basePath}/${name}-${suffix}`;
      }

      await mkdir(candidate, { recursive: true });
      return candidate;
    } catch (err) {
      console.error('[createProjectDirectory] Error:', err);
      return null;
    }
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
    await listen('menu:file:open_folder', () => eventBus.emit('menu:file:open_folder'));
    await listen('menu:file:save', () => eventBus.emit('menu:file:save'));
    await listen('menu:file:save_as', () => eventBus.emit('menu:file:save_as'));
    await listen('menu:file:save_all', () => eventBus.emit('menu:file:save_all'));
    await listen<string>('menu:file:export', (event) => {
      eventBus.emit('menu:file:export', event.payload as import('./types').ExportFormat);
    });
  }
}
