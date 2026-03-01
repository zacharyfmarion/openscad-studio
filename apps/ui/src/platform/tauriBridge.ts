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

  async readDirectoryFiles(
    dirPath: string,
    extensions: string[] = ['scad']
  ): Promise<Record<string, string>> {
    const { readDir, readTextFile } = await import('@tauri-apps/plugin-fs');
    const files: Record<string, string> = {};

    const walk = async (currentDir: string, prefix: string) => {
      const entries = await readDir(currentDir);
      for (const entry of entries) {
        const entryPath = currentDir + '/' + entry.name;
        const relativePath = prefix ? prefix + '/' + entry.name : entry.name;

        if (entry.isDirectory) {
          await walk(entryPath, relativePath);
        } else if (extensions.some((ext) => entry.name.endsWith('.' + ext))) {
          try {
            files[relativePath] = await readTextFile(entryPath);
          } catch {
            // Skip files that can't be read
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

  async getDefaultLibraryPaths(): Promise<string[]> {
    const { homeDir } = await import('@tauri-apps/api/path');
    const { readDir } = await import('@tauri-apps/plugin-fs');

    let home = await homeDir();
    if (!home.endsWith('/')) home += '/';
    const candidates = [
      // macOS
      home + 'Documents/OpenSCAD/libraries',
      home + '.local/share/OpenSCAD/libraries',
      // Linux
      home + '.local/share/openscad/libraries',
      // Windows
      home + 'Documents/OpenSCAD/libraries',
      home + 'AppData/Roaming/OpenSCAD/libraries',
    ];


    const existing: string[] = [];
    const seen = new Set<string>();
    for (const candidate of candidates) {
      if (seen.has(candidate)) continue;
      seen.add(candidate);
      try {
        await readDir(candidate);
        existing.push(candidate);
      } catch (err) {
      }
    }
    return existing;
  }

  async pickDirectory(): Promise<string | null> {
    const { open } = await import('@tauri-apps/plugin-dialog');
    const selected = await open({ directory: true, multiple: false });
    if (!selected) return null;
    return typeof selected === 'string' ? selected : (selected as { path: string }).path;
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
