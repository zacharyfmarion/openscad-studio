/**
 * Tests for the resolvePathConflict helper defined in App.tsx.
 * Since it's a module-level function (not exported), we duplicate the logic
 * here so it can be tested independently.
 */

function resolvePathConflict(candidatePath: string, existing: Set<string>): string {
  if (!existing.has(candidatePath)) return candidatePath;
  const lastSlash = candidatePath.lastIndexOf('/');
  const lastDot = candidatePath.lastIndexOf('.');
  const hasExt = lastDot > lastSlash + 1;
  const stem = hasExt ? candidatePath.slice(0, lastDot) : candidatePath;
  const ext = hasExt ? candidatePath.slice(lastDot) : '';
  let i = 1;
  while (existing.has(`${stem}_${i}${ext}`)) i++;
  return `${stem}_${i}${ext}`;
}

describe('resolvePathConflict', () => {
  it('returns the original path when there is no conflict', () => {
    const existing = new Set(['a.scad', 'b.scad']);
    expect(resolvePathConflict('c.scad', existing)).toBe('c.scad');
  });

  it('appends _1 for a single conflict', () => {
    const existing = new Set(['main.scad']);
    expect(resolvePathConflict('main.scad', existing)).toBe('main_1.scad');
  });

  it('appends _2 when _1 is also taken', () => {
    const existing = new Set(['main.scad', 'main_1.scad']);
    expect(resolvePathConflict('main.scad', existing)).toBe('main_2.scad');
  });

  it('increments past multiple taken slots', () => {
    const existing = new Set(['f.scad', 'f_1.scad', 'f_2.scad', 'f_3.scad']);
    expect(resolvePathConflict('f.scad', existing)).toBe('f_4.scad');
  });

  it('handles files with no extension', () => {
    const existing = new Set(['myfile']);
    expect(resolvePathConflict('myfile', existing)).toBe('myfile_1');
  });

  it('handles files with multiple dots — uses last segment as extension', () => {
    const existing = new Set(['my.test.scad']);
    expect(resolvePathConflict('my.test.scad', existing)).toBe('my.test_1.scad');
  });

  it('handles files in subdirectories', () => {
    const existing = new Set(['lib/utils.scad']);
    expect(resolvePathConflict('lib/utils.scad', existing)).toBe('lib/utils_1.scad');
  });

  it('does not confuse the directory dot with an extension', () => {
    // "lib.v2/utils" — the dot is in the directory part, not the filename
    const existing = new Set(['lib.v2/utils']);
    expect(resolvePathConflict('lib.v2/utils', existing)).toBe('lib.v2/utils_1');
  });

  it('returns immediately when empty set — no conflict possible', () => {
    expect(resolvePathConflict('anything.scad', new Set())).toBe('anything.scad');
  });
});
