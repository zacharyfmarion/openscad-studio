import {
  getRelativeProjectPath,
  normalizeProjectRelativePath,
} from '../projectFilePaths';

describe('normalizeProjectRelativePath', () => {
  it('keeps simple relative paths', () => {
    expect(normalizeProjectRelativePath('lib/utils.scad')).toBe('lib/utils.scad');
  });

  it('normalizes dot segments', () => {
    expect(normalizeProjectRelativePath('./lib/../parts/widget.scad')).toBe('parts/widget.scad');
  });

  it('rejects leading traversal outside the working directory', () => {
    expect(normalizeProjectRelativePath('../outside.scad')).toBeNull();
  });

  it('rejects absolute paths', () => {
    expect(normalizeProjectRelativePath('/tmp/file.scad')).toBeNull();
  });

  it('normalizes windows separators', () => {
    expect(normalizeProjectRelativePath('lib\\utils.scad')).toBe('lib/utils.scad');
  });
});

describe('getRelativeProjectPath', () => {
  it('returns a relative path for files inside the working directory', () => {
    expect(getRelativeProjectPath('/project', '/project/lib/utils.scad')).toBe('lib/utils.scad');
  });

  it('falls back to the file name for paths outside the working directory', () => {
    expect(getRelativeProjectPath('/project', '/other/main.scad')).toBe('main.scad');
  });

  it('returns null when either path is missing', () => {
    expect(getRelativeProjectPath(null, '/project/main.scad')).toBeNull();
    expect(getRelativeProjectPath('/project', null)).toBeNull();
  });
});
