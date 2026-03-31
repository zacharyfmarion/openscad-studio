/**
 * Read all .scad files from a DataTransferItemList (OS drag-and-drop).
 *
 * Unlike the old readDroppedFolder used in FileTreePanel, this utility:
 * - Preserves the top-level folder name (dropping "lib/" gives "lib/a.scad")
 * - Correctly paginates readEntries (the API returns at most 100 entries per
 *   call, so a single call misses files in large directories)
 *
 * Returns a Record of relative paths → file contents, or null if no .scad
 * files were found.
 */

async function readAllEntries(reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> {
  const all: FileSystemEntry[] = [];
  while (true) {
    const batch = await new Promise<FileSystemEntry[]>((resolve, reject) => {
      reader.readEntries(resolve, reject);
    });
    if (batch.length === 0) break;
    all.push(...batch);
  }
  return all;
}

async function walkEntry(
  entry: FileSystemEntry,
  prefix: string,
  files: Record<string, string>
): Promise<void> {
  if (entry.isFile) {
    if (!entry.name.endsWith('.scad')) return;
    const file = await new Promise<File>((resolve, reject) => {
      (entry as FileSystemFileEntry).file(resolve, reject);
    });
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    files[path] = await file.text();
  } else if (entry.isDirectory) {
    const reader = (entry as FileSystemDirectoryEntry).createReader();
    const children = await readAllEntries(reader);
    const nextPrefix = prefix ? `${prefix}/${entry.name}` : entry.name;
    for (const child of children) {
      await walkEntry(child, nextPrefix, files);
    }
  }
}

export async function readDroppedItems(
  items: DataTransferItemList
): Promise<Record<string, string> | null> {
  // Clone immediately — DataTransfer items become inaccessible after the first await
  const entries: FileSystemEntry[] = [];
  for (const item of Array.from(items)) {
    const entry = item.webkitGetAsEntry?.();
    if (entry) entries.push(entry);
  }

  if (entries.length === 0) return null;

  const files: Record<string, string> = {};
  for (const entry of entries) {
    await walkEntry(entry, '', files);
  }

  return Object.keys(files).length > 0 ? files : null;
}
