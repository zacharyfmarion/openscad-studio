import {
  parseIncludes,
  parseImports,
  stripCommentsAndStrings,
  stripComments,
} from '../includeParser';

describe('stripCommentsAndStrings', () => {
  it('strips single-line comments', () => {
    const code = 'include <foo.scad> // this is a comment\ncube(10);';
    const result = stripCommentsAndStrings(code);
    expect(result).toContain('include <foo.scad>');
    expect(result).not.toContain('this is a comment');
  });

  it('strips block comments', () => {
    const code = '/* include <hidden.scad> */\ninclude <visible.scad>';
    const result = stripCommentsAndStrings(code);
    expect(result).not.toContain('hidden.scad');
    expect(result).toContain('include <visible.scad>');
  });

  it('strips multi-line block comments', () => {
    const code = '/*\n * include <hidden.scad>\n */\ninclude <visible.scad>';
    const result = stripCommentsAndStrings(code);
    expect(result).not.toContain('hidden.scad');
    expect(result).toContain('include <visible.scad>');
  });

  it('strips string literals', () => {
    const code = 'echo("include <fake.scad>");\ninclude <real.scad>';
    const result = stripCommentsAndStrings(code);
    expect(result).not.toContain('fake.scad');
    expect(result).toContain('include <real.scad>');
  });

  it('handles escaped quotes in strings', () => {
    const code = 'echo("a \\"include <fake.scad>\\" b");\ninclude <real.scad>';
    const result = stripCommentsAndStrings(code);
    expect(result).not.toContain('fake.scad');
    expect(result).toContain('include <real.scad>');
  });

  it('preserves line structure (newlines)', () => {
    const code = '// comment\ninclude <foo.scad>';
    const result = stripCommentsAndStrings(code);
    expect(result).toContain('\n');
    expect(result.split('\n')).toHaveLength(2);
  });

  it('handles code with no comments or strings', () => {
    const code = 'cube(10);\nsphere(5);';
    const result = stripCommentsAndStrings(code);
    expect(result).toBe(code);
  });

  it('handles empty input', () => {
    expect(stripCommentsAndStrings('')).toBe('');
  });
});

describe('parseIncludes', () => {
  it('parses a simple include', () => {
    const result = parseIncludes('include <foo.scad>');
    expect(result).toEqual([{ type: 'include', path: 'foo.scad' }]);
  });

  it('parses a simple use', () => {
    const result = parseIncludes('use <bar.scad>');
    expect(result).toEqual([{ type: 'use', path: 'bar.scad' }]);
  });

  it('parses multiple directives', () => {
    const code = 'include <a.scad>\nuse <b.scad>\ninclude <c.scad>';
    const result = parseIncludes(code);
    expect(result).toEqual([
      { type: 'include', path: 'a.scad' },
      { type: 'use', path: 'b.scad' },
      { type: 'include', path: 'c.scad' },
    ]);
  });

  it('parses paths with subdirectories', () => {
    const result = parseIncludes('include <BOSL2/std.scad>');
    expect(result).toEqual([{ type: 'include', path: 'BOSL2/std.scad' }]);
  });

  it('parses deeply nested paths', () => {
    const result = parseIncludes('include <a/b/c/d.scad>');
    expect(result).toEqual([{ type: 'include', path: 'a/b/c/d.scad' }]);
  });

  it('parses parent-relative paths (..)', () => {
    const result = parseIncludes('include <../sibling/file.scad>');
    expect(result).toEqual([{ type: 'include', path: '../sibling/file.scad' }]);
  });

  it('handles whitespace around path', () => {
    const result = parseIncludes('include <  foo.scad  >');
    expect(result).toEqual([{ type: 'include', path: 'foo.scad' }]);
  });

  it('handles whitespace between keyword and bracket', () => {
    const result = parseIncludes('include  <foo.scad>');
    expect(result).toEqual([{ type: 'include', path: 'foo.scad' }]);
  });

  it('ignores commented-out includes', () => {
    const code = '// include <commented.scad>\ninclude <real.scad>';
    const result = parseIncludes(code);
    expect(result).toEqual([{ type: 'include', path: 'real.scad' }]);
  });

  it('ignores block-commented includes', () => {
    const code = '/* include <hidden.scad> */\nuse <visible.scad>';
    const result = parseIncludes(code);
    expect(result).toEqual([{ type: 'use', path: 'visible.scad' }]);
  });

  it('ignores includes inside string literals', () => {
    const code = 'echo("include <fake.scad>");\ninclude <real.scad>';
    const result = parseIncludes(code);
    expect(result).toEqual([{ type: 'include', path: 'real.scad' }]);
  });

  it('returns empty array for code with no includes', () => {
    const result = parseIncludes('cube(10);\nsphere(5);');
    expect(result).toEqual([]);
  });

  it('returns empty array for empty input', () => {
    expect(parseIncludes('')).toEqual([]);
  });

  it('handles include on same line as code', () => {
    const code = 'include <foo.scad> cube(10);';
    const result = parseIncludes(code);
    expect(result).toEqual([{ type: 'include', path: 'foo.scad' }]);
  });

  it('does not match partial keyword names', () => {
    // "includes" is not a valid directive, only "include"
    const code = 'includes <fake.scad>\ninclude <real.scad>';
    const result = parseIncludes(code);
    // "includes" should not match since \b word boundary handles it
    expect(result.find((d) => d.path === 'fake.scad')).toBeUndefined();
    expect(result).toContainEqual({ type: 'include', path: 'real.scad' });
  });

  it('handles mixed include and use with comments', () => {
    const code = [
      'include <BOSL2/std.scad>',
      '// include <commented.scad>',
      'use <helpers.scad>',
      '/* use <blocked.scad> */',
      'include <sub/deep.scad>',
    ].join('\n');
    const result = parseIncludes(code);
    expect(result).toEqual([
      { type: 'include', path: 'BOSL2/std.scad' },
      { type: 'use', path: 'helpers.scad' },
      { type: 'include', path: 'sub/deep.scad' },
    ]);
  });

  it('handles real-world BOSL2 usage pattern', () => {
    const code = [
      'include <BOSL2/std.scad>',
      '',
      'cuboid([20, 10, 5], rounding=1, edges="Z");',
    ].join('\n');
    const result = parseIncludes(code);
    expect(result).toEqual([{ type: 'include', path: 'BOSL2/std.scad' }]);
  });
});

describe('stripComments', () => {
  it('strips single-line comments but preserves strings', () => {
    const code = 'import("file.svg"); // a comment';
    const result = stripComments(code);
    expect(result).toContain('"file.svg"');
    expect(result).not.toContain('a comment');
  });

  it('strips block comments but preserves strings', () => {
    const code = '/* import("hidden.svg") */\nimport("visible.svg");';
    const result = stripComments(code);
    expect(result).not.toContain('hidden.svg');
    expect(result).toContain('"visible.svg"');
  });

  it('preserves escaped quotes in strings', () => {
    const code = 'echo("a \\"quoted\\" thing"); import("real.svg");';
    const result = stripComments(code);
    expect(result).toContain('"real.svg"');
  });

  it('handles empty input', () => {
    expect(stripComments('')).toBe('');
  });
});

describe('parseImports', () => {
  it('parses a simple import', () => {
    const result = parseImports('import("branding.svg");');
    expect(result).toEqual([{ type: 'import', path: 'branding.svg' }]);
  });

  it('parses import with relative path', () => {
    const result = parseImports('import("../../branding.svg");');
    expect(result).toEqual([{ type: 'import', path: '../../branding.svg' }]);
  });

  it('parses import with additional parameters', () => {
    const result = parseImports('import("model.stl", convexity=10);');
    expect(result).toEqual([{ type: 'import', path: 'model.stl' }]);
  });

  it('parses multiple imports', () => {
    const code = 'import("a.svg");\nimport("b.dxf");\nimport("c.stl");';
    const result = parseImports(code);
    expect(result).toEqual([
      { type: 'import', path: 'a.svg' },
      { type: 'import', path: 'b.dxf' },
      { type: 'import', path: 'c.stl' },
    ]);
  });

  it('ignores commented-out imports', () => {
    const code = '// import("hidden.svg");\nimport("visible.svg");';
    const result = parseImports(code);
    expect(result).toEqual([{ type: 'import', path: 'visible.svg' }]);
  });

  it('ignores block-commented imports', () => {
    const code = '/* import("hidden.svg"); */\nimport("visible.svg");';
    const result = parseImports(code);
    expect(result).toEqual([{ type: 'import', path: 'visible.svg' }]);
  });

  it('returns empty array for code with no imports', () => {
    const result = parseImports('cube(10);\ninclude <foo.scad>');
    expect(result).toEqual([]);
  });

  it('handles whitespace around path', () => {
    const result = parseImports('import( "file.svg" );');
    expect(result).toEqual([{ type: 'import', path: 'file.svg' }]);
  });

  it('handles subdirectory paths', () => {
    const result = parseImports('import("assets/models/part.stl");');
    expect(result).toEqual([{ type: 'import', path: 'assets/models/part.stl' }]);
  });

  it('does not match non-import uses of parentheses with strings', () => {
    const result = parseImports('echo("import is not this");');
    expect(result).toEqual([]);
  });
});
