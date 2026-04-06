import { readDroppedItems } from '../readDroppedItems';

// ── Helpers to build mock FileSystemEntry trees ──────────────────────────────

function makeFileEntry(name: string, content: string): FileSystemFileEntry {
  return {
    name,
    isFile: true,
    isDirectory: false,
    file: (success: (f: File) => void) => success(new File([content], name)),
  } as unknown as FileSystemFileEntry;
}

function makeDirEntry(name: string, children: FileSystemEntry[]): FileSystemDirectoryEntry {
  let called = false;
  return {
    name,
    isFile: false,
    isDirectory: true,
    createReader: () => ({
      readEntries: (success: (entries: FileSystemEntry[]) => void) => {
        // Return children on first call, empty array on subsequent calls (pagination terminator)
        if (!called) {
          called = true;
          success(children);
        } else {
          success([]);
        }
      },
    }),
  } as unknown as FileSystemDirectoryEntry;
}

/** Build a DataTransferItemList mock from a list of FileSystemEntry objects */
function makeItemList(entries: FileSystemEntry[]): DataTransferItemList {
  const items = entries.map((entry) => ({
    webkitGetAsEntry: () => entry,
  }));
  return {
    ...items,
    length: items.length,
    [Symbol.iterator]: () => items[Symbol.iterator](),
  } as unknown as DataTransferItemList;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('readDroppedItems', () => {
  it('returns null when the item list is empty', async () => {
    const result = await readDroppedItems(makeItemList([]));
    expect(result).toBeNull();
  });

  it('returns null when no OpenSCAD project files are found', async () => {
    const items = makeItemList([makeFileEntry('readme.txt', 'hello')]);
    const result = await readDroppedItems(items);
    expect(result).toBeNull();
  });

  it('reads a flat .scad file drop', async () => {
    const items = makeItemList([makeFileEntry('main.scad', 'cube(10);')]);
    const result = await readDroppedItems(items);
    expect(result).toEqual({ 'main.scad': 'cube(10);' });
  });

  it('reads a flat .h file drop', async () => {
    const items = makeItemList([makeFileEntry('constants.h', 'wall = 2;')]);
    const result = await readDroppedItems(items);
    expect(result).toEqual({ 'constants.h': 'wall = 2;' });
  });

  it('preserves the top-level folder name (does NOT strip it)', async () => {
    const dir = makeDirEntry('lib', [makeFileEntry('utils.scad', '// util')]);
    const result = await readDroppedItems(makeItemList([dir]));
    expect(result).toEqual({ 'lib/utils.scad': '// util' });
  });

  it('handles nested subdirectories', async () => {
    const inner = makeDirEntry('helpers', [makeFileEntry('h.scad', '// h')]);
    const outer = makeDirEntry('lib', [inner]);
    const result = await readDroppedItems(makeItemList([outer]));
    expect(result).toEqual({ 'lib/helpers/h.scad': '// h' });
  });

  it('filters out unsupported files', async () => {
    const dir = makeDirEntry('lib', [
      makeFileEntry('utils.scad', '// scad'),
      makeFileEntry('constants.h', '// header'),
      makeFileEntry('readme.txt', 'text'),
      makeFileEntry('image.png', 'binary'),
    ]);
    const result = await readDroppedItems(makeItemList([dir]));
    expect(result).toEqual({ 'lib/constants.h': '// header', 'lib/utils.scad': '// scad' });
  });

  it('paginates readEntries — calls until empty array is returned', async () => {
    // Simulate a directory where readEntries returns entries in two batches
    const file1 = makeFileEntry('a.scad', '// a');
    const file2 = makeFileEntry('b.scad', '// b');
    let callCount = 0;
    const paginatedDir: FileSystemDirectoryEntry = {
      name: 'lib',
      isFile: false,
      isDirectory: true,
      createReader: () => ({
        readEntries: (success: (entries: FileSystemEntry[]) => void) => {
          callCount++;
          if (callCount === 1) success([file1]);
          else if (callCount === 2) success([file2]);
          else success([]); // terminator
        },
      }),
    } as unknown as FileSystemDirectoryEntry;

    const result = await readDroppedItems(makeItemList([paginatedDir]));
    expect(result).toEqual({ 'lib/a.scad': '// a', 'lib/b.scad': '// b' });
    expect(callCount).toBe(3); // 2 batches + 1 terminator
  });

  it('handles multiple top-level entries', async () => {
    const f1 = makeFileEntry('a.scad', '// a');
    const f2 = makeFileEntry('b.scad', '// b');
    const result = await readDroppedItems(makeItemList([f1, f2]));
    expect(result).toEqual({ 'a.scad': '// a', 'b.scad': '// b' });
  });
});
