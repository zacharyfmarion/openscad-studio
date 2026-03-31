import { isValidDrop } from '../isValidDrop';

describe('isValidDrop', () => {
  // ── File drops ───────────────────────────────────────────────────────────

  it('returns false when dropping a file onto its current parent folder', () => {
    expect(isValidDrop('lib/utils.scad', false, 'lib')).toBe(false);
  });

  it('returns false when dropping a root-level file onto root (empty string parent)', () => {
    expect(isValidDrop('main.scad', false, '')).toBe(false);
  });

  it('returns true when moving a file to a different folder', () => {
    expect(isValidDrop('lib/utils.scad', false, 'src')).toBe(true);
  });

  it('returns true when moving a file from a subfolder to root', () => {
    expect(isValidDrop('lib/utils.scad', false, '')).toBe(true);
  });

  it('returns true when moving a root file into a subfolder', () => {
    expect(isValidDrop('main.scad', false, 'lib')).toBe(true);
  });

  it('returns true when moving a file to a deeply nested folder', () => {
    expect(isValidDrop('a.scad', false, 'src/lib/helpers')).toBe(true);
  });

  // ── Folder drops ─────────────────────────────────────────────────────────

  it('returns false when dropping a folder onto itself', () => {
    expect(isValidDrop('lib', true, 'lib')).toBe(false);
  });

  it('returns false when dropping a folder into one of its direct children', () => {
    expect(isValidDrop('lib', true, 'lib/sub')).toBe(false);
  });

  it('returns false when dropping a folder into a deeply nested descendant', () => {
    expect(isValidDrop('lib', true, 'lib/a/b/c')).toBe(false);
  });

  it('returns false when dropping a folder onto its current parent', () => {
    expect(isValidDrop('src/lib', true, 'src')).toBe(false);
  });

  it('returns true when moving a folder to a sibling folder', () => {
    expect(isValidDrop('lib', true, 'src')).toBe(true);
  });

  it('returns true when moving a folder to root', () => {
    expect(isValidDrop('src/lib', true, '')).toBe(true);
  });

  it('returns true when moving a root folder into another folder', () => {
    expect(isValidDrop('lib', true, 'src')).toBe(true);
  });

  it('does not confuse a prefix match without a slash (e.g. "lib" vs "library")', () => {
    // "library" is NOT a descendant of "lib"
    expect(isValidDrop('lib', true, 'library')).toBe(true);
  });
});
