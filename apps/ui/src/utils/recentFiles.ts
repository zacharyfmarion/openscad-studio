export interface RecentFile {
  path: string;
  name: string;
  lastOpened: number;
}

const RECENT_FILES_KEY = 'openscad-studio-recent-files';
const MAX_RECENT_FILES = 3;

function normalizeRecentFile(file: Partial<RecentFile>): RecentFile | null {
  if (!file.path || typeof file.path !== 'string') {
    return null;
  }

  return {
    path: file.path,
    name:
      typeof file.name === 'string' && file.name.trim().length > 0
        ? file.name
        : file.path.split('/').pop() || file.path,
    lastOpened: typeof file.lastOpened === 'number' ? file.lastOpened : 0,
  };
}

export function pruneRecentFiles(files: RecentFile[], maxCount: number = MAX_RECENT_FILES): RecentFile[] {
  const deduped = new Map<string, RecentFile>();

  for (const file of files) {
    const normalized = normalizeRecentFile(file);
    if (!normalized) continue;

    const existing = deduped.get(normalized.path);
    if (!existing || normalized.lastOpened > existing.lastOpened) {
      deduped.set(normalized.path, normalized);
    }
  }

  return [...deduped.values()]
    .sort((a, b) => b.lastOpened - a.lastOpened)
    .slice(0, maxCount);
}

export function loadRecentFiles(): RecentFile[] {
  try {
    const stored = localStorage.getItem(RECENT_FILES_KEY);
    if (!stored) return [];

    const parsed = JSON.parse(stored) as Partial<RecentFile>[];
    return pruneRecentFiles(parsed as RecentFile[]);
  } catch (error) {
    console.error('[recentFiles] Failed to load recent files:', error);
    return [];
  }
}

export function saveRecentFiles(files: RecentFile[]): RecentFile[] {
  const pruned = pruneRecentFiles(files);

  try {
    localStorage.setItem(RECENT_FILES_KEY, JSON.stringify(pruned));
  } catch (error) {
    console.error('[recentFiles] Failed to save recent files:', error);
  }

  return pruned;
}

export function addRecentFile(path: string): RecentFile[] {
  const files = loadRecentFiles();
  const fileName = path.split('/').pop() || path;
  const existing = files.find((file) => file.path === path);

  if (existing) {
    existing.lastOpened = Date.now();
    existing.name = fileName;
  } else {
    files.push({
      path,
      name: fileName,
      lastOpened: Date.now(),
    });
  }

  return saveRecentFiles(files);
}

export function removeRecentFile(path: string): RecentFile[] {
  return saveRecentFiles(loadRecentFiles().filter((file) => file.path !== path));
}
