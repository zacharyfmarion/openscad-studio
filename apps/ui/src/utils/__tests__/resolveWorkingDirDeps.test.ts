import { jest } from '@jest/globals';
import { normalizePath, resolveWorkingDirDeps } from '../resolveWorkingDirDeps';
import type { PlatformBridge } from '../../platform/types';

describe('normalizePath', () => {
  it('returns simple path unchanged', () => {
    expect(normalizePath('foo.scad')).toBe('foo.scad');
  });

  it('resolves .. segments', () => {
    expect(normalizePath('sub/../file.scad')).toBe('file.scad');
  });

  it('resolves . segments', () => {
    expect(normalizePath('./sub/file.scad')).toBe('sub/file.scad');
  });

  it('resolves multiple .. segments', () => {
    expect(normalizePath('a/b/../../c.scad')).toBe('c.scad');
  });

  it('handles nested subdirectories', () => {
    expect(normalizePath('a/b/c/d.scad')).toBe('a/b/c/d.scad');
  });

  it('handles empty string', () => {
    expect(normalizePath('')).toBe('');
  });

  it('handles leading ..', () => {
    // Escaping above working dir — normalized but still starts with nothing
    expect(normalizePath('../sibling/file.scad')).toBe('sibling/file.scad');
  });
});

describe('resolveWorkingDirDeps', () => {
  // Create a mock platform bridge
  function createMockPlatform(
    files: Record<string, string>
  ): Pick<PlatformBridge, 'readTextFile' | 'fileExists'> {
    return {
      readTextFile: jest.fn(async (absolutePath: string) => {
        return files[absolutePath] ?? null;
      }),
      fileExists: jest.fn(async (absolutePath: string) => {
        return absolutePath in files;
      }),
    };
  }

  it('resolves a simple include from working dir', async () => {
    const platform = createMockPlatform({
      '/project/helpers.scad': 'module helper() { cube(5); }',
    });

    const result = await resolveWorkingDirDeps('include <helpers.scad>\ncube(10);', {
      workingDir: '/project',
      libraryFiles: {},
      platform: platform as unknown as PlatformBridge,
    });

    expect(result).toEqual({
      'helpers.scad': 'module helper() { cube(5); }',
    });
    expect(platform.readTextFile).toHaveBeenCalledWith('/project/helpers.scad');
  });

  it('resolves subfolder includes', async () => {
    const platform = createMockPlatform({
      '/project/sub/deep.scad': 'module deep() { sphere(3); }',
    });

    const result = await resolveWorkingDirDeps('include <sub/deep.scad>', {
      workingDir: '/project',
      libraryFiles: {},
      platform: platform as unknown as PlatformBridge,
    });

    expect(result).toEqual({
      'sub/deep.scad': 'module deep() { sphere(3); }',
    });
  });

  it('skips paths already in library files', async () => {
    const platform = createMockPlatform({});

    const libraryFiles = {
      'BOSL2/std.scad': '// BOSL2 std content',
    };

    const result = await resolveWorkingDirDeps('include <BOSL2/std.scad>', {
      workingDir: '/project',
      libraryFiles,
      platform: platform as unknown as PlatformBridge,
    });

    expect(result).toEqual({});
    // Should NOT have tried to read from working dir
    expect(platform.readTextFile).not.toHaveBeenCalled();
  });

  it('resolves transitive includes', async () => {
    const platform = createMockPlatform({
      '/project/a.scad': 'include <b.scad>\nmodule a() { b(); }',
      '/project/b.scad': 'module b() { cube(1); }',
    });

    const result = await resolveWorkingDirDeps('include <a.scad>', {
      workingDir: '/project',
      libraryFiles: {},
      platform: platform as unknown as PlatformBridge,
    });

    expect(result).toEqual({
      'a.scad': 'include <b.scad>\nmodule a() { b(); }',
      'b.scad': 'module b() { cube(1); }',
    });
  });

  it('handles circular includes without infinite loop', async () => {
    const platform = createMockPlatform({
      '/project/a.scad': 'include <b.scad>\nmodule a() {}',
      '/project/b.scad': 'include <a.scad>\nmodule b() {}',
    });

    const result = await resolveWorkingDirDeps('include <a.scad>', {
      workingDir: '/project',
      libraryFiles: {},
      platform: platform as unknown as PlatformBridge,
    });

    // Should resolve both files but not loop
    expect(result).toEqual({
      'a.scad': 'include <b.scad>\nmodule a() {}',
      'b.scad': 'include <a.scad>\nmodule b() {}',
    });
  });

  it('handles missing files gracefully', async () => {
    const platform = createMockPlatform({});

    const result = await resolveWorkingDirDeps('include <nonexistent.scad>', {
      workingDir: '/project',
      libraryFiles: {},
      platform: platform as unknown as PlatformBridge,
    });

    // Missing file should just be skipped
    expect(result).toEqual({});
  });

  it('ignores commented-out includes', async () => {
    const platform = createMockPlatform({
      '/project/real.scad': 'module real() {}',
    });

    const code = '// include <fake.scad>\ninclude <real.scad>';
    const result = await resolveWorkingDirDeps(code, {
      workingDir: '/project',
      libraryFiles: {},
      platform: platform as unknown as PlatformBridge,
    });

    expect(result).toEqual({
      'real.scad': 'module real() {}',
    });
    // Should NOT have tried to read fake.scad
    expect(platform.readTextFile).not.toHaveBeenCalledWith('/project/fake.scad');
  });

  it('returns empty map for code with no includes', async () => {
    const platform = createMockPlatform({});

    const result = await resolveWorkingDirDeps('cube(10);', {
      workingDir: '/project',
      libraryFiles: {},
      platform: platform as unknown as PlatformBridge,
    });

    expect(result).toEqual({});
    expect(platform.readTextFile).not.toHaveBeenCalled();
  });

  it('handles mix of library and working dir includes', async () => {
    const platform = createMockPlatform({
      '/project/local.scad': 'module local() { cube(5); }',
    });

    const libraryFiles = {
      'BOSL2/std.scad': '// BOSL2',
    };

    const code = 'include <BOSL2/std.scad>\ninclude <local.scad>';
    const result = await resolveWorkingDirDeps(code, {
      workingDir: '/project',
      libraryFiles,
      platform: platform as unknown as PlatformBridge,
    });

    // Only local.scad should be resolved — BOSL2 is in library files
    expect(result).toEqual({
      'local.scad': 'module local() { cube(5); }',
    });
  });

  it('resolves 3-level deep transitive includes', async () => {
    const platform = createMockPlatform({
      '/project/entry.scad': 'include <mid.scad>',
      '/project/mid.scad': 'include <sub/deep.scad>',
      '/project/sub/deep.scad': 'module deep() {}',
    });

    const result = await resolveWorkingDirDeps('include <entry.scad>', {
      workingDir: '/project',
      libraryFiles: {},
      platform: platform as unknown as PlatformBridge,
    });

    expect(result).toEqual({
      'entry.scad': 'include <mid.scad>',
      'mid.scad': 'include <sub/deep.scad>',
      'sub/deep.scad': 'module deep() {}',
    });
  });

  // --- import() resolution ---

  it('resolves import() calls for SVG files', async () => {
    const platform = createMockPlatform({
      '/project/branding.svg': '<svg>...</svg>',
    });

    const code = 'import("branding.svg");';
    const result = await resolveWorkingDirDeps(code, {
      workingDir: '/project',
      libraryFiles: {},
      platform: platform as unknown as PlatformBridge,
      renderTargetDir: '',
    });

    expect(result).toEqual({
      'branding.svg': '<svg>...</svg>',
    });
  });

  it('resolves import() with relative paths from render target directory', async () => {
    const platform = createMockPlatform({
      // ../../branding.svg from examples/poly555/openscad goes up 2 dirs
      // → examples/branding.svg
      '/project/examples/branding.svg': '<svg>brand</svg>',
    });

    // The render target is at examples/poly555/openscad/poly555.scad
    // The code imports ../../branding.svg which resolves relative to renderTargetDir
    const code = 'import("../../branding.svg");';
    const result = await resolveWorkingDirDeps(code, {
      workingDir: '/project',
      libraryFiles: {},
      platform: platform as unknown as PlatformBridge,
      renderTargetDir: 'examples/poly555/openscad',
    });

    expect(result).toEqual({
      'examples/branding.svg': '<svg>brand</svg>',
    });
  });

  it('resolves import() from included files relative to included file directory', async () => {
    const platform = createMockPlatform({
      // lib/engraving.scad is included from the render target
      '/project/examples/poly555/openscad/lib/engraving.scad':
        'import("../../branding.svg");\nmodule engrave() {}',
      // The import path ../../branding.svg from lib/ resolves to examples/poly555/branding.svg
      '/project/examples/poly555/branding.svg': '<svg>brand</svg>',
    });

    const code = 'include <lib/engraving.scad>';
    const result = await resolveWorkingDirDeps(code, {
      workingDir: '/project',
      libraryFiles: {},
      platform: platform as unknown as PlatformBridge,
      renderTargetDir: 'examples/poly555/openscad',
    });

    expect(result['examples/poly555/openscad/lib/engraving.scad']).toBeDefined();
    expect(result['examples/poly555/branding.svg']).toBe('<svg>brand</svg>');
  });

  it('does not recurse into imported asset files', async () => {
    const platform = createMockPlatform({
      // SVG file that happens to contain text matching include syntax
      '/project/logo.svg': '<svg>include <fake.scad></svg>',
    });

    const code = 'import("logo.svg");';
    const result = await resolveWorkingDirDeps(code, {
      workingDir: '/project',
      libraryFiles: {},
      platform: platform as unknown as PlatformBridge,
      renderTargetDir: '',
    });

    // Should include the SVG but NOT try to resolve fake.scad from it
    expect(result).toEqual({
      'logo.svg': '<svg>include <fake.scad></svg>',
    });
    expect(platform.readTextFile).not.toHaveBeenCalledWith('/project/fake.scad');
  });

  it('resolves both includes and imports from the same file', async () => {
    const platform = createMockPlatform({
      '/project/helpers.scad': 'module helper() {}',
      '/project/logo.svg': '<svg>logo</svg>',
    });

    const code = 'include <helpers.scad>\nimport("logo.svg");';
    const result = await resolveWorkingDirDeps(code, {
      workingDir: '/project',
      libraryFiles: {},
      platform: platform as unknown as PlatformBridge,
      renderTargetDir: '',
    });

    expect(result).toEqual({
      'helpers.scad': 'module helper() {}',
      'logo.svg': '<svg>logo</svg>',
    });
  });

  it('handles missing imported files gracefully', async () => {
    const platform = createMockPlatform({});

    const code = 'import("nonexistent.svg");';
    const result = await resolveWorkingDirDeps(code, {
      workingDir: '/project',
      libraryFiles: {},
      platform: platform as unknown as PlatformBridge,
      renderTargetDir: '',
    });

    expect(result).toEqual({});
  });
});
