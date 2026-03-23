/**
 * Unit tests for the customizer parameter replacement logic.
 *
 * These tests exercise replaceParamValue in isolation by constructing
 * CustomizerParam objects with known byte offsets — no WASM or DOM needed.
 *
 * The function under test lives in CustomizerPanel.tsx but is tested here
 * via a thin re-export to keep the test file focused on logic.
 */

import { replaceParamValue as replaceParamValueForTest } from '../customizer/replaceParamValue';

// ─── helpers ────────────────────────────────────────────────────────────────

/**
 * Build a minimal CustomizerParam for the value token `rawValue` found at
 * position `startIndex` in the given source string.
 */
function makeParam(
  name: string,
  rawValue: string,
  source: string,
  startIndex?: number
): Parameters<typeof replaceParamValueForTest>[1] {
  const idx = startIndex ?? source.indexOf(rawValue);
  return {
    name,
    rawValue,
    value: rawValue,
    type: 'number' as const,
    line: 1,
    valueStartIndex: idx,
    valueEndIndex: idx + rawValue.length,
  };
}

// ─── AST path (offsets valid) ────────────────────────────────────────────────

describe('replaceParamValue — AST byte-range path', () => {
  it('replaces a basic number', () => {
    const code = 'width = 10;\n';
    const param = makeParam('width', '10', code);
    expect(replaceParamValueForTest(code, param, '15')).toBe('width = 15;\n');
  });

  it('preserves trailing comment', () => {
    const code = 'width = 10; // [5:50]\n';
    const param = makeParam('width', '10', code);
    expect(replaceParamValueForTest(code, param, '25')).toBe('width = 25; // [5:50]\n');
  });

  it('replaces a float value', () => {
    const code = 'ratio = 0.5;\n';
    const param = makeParam('ratio', '0.5', code);
    expect(replaceParamValueForTest(code, param, '0.75')).toBe('ratio = 0.75;\n');
  });

  it('replaces a boolean', () => {
    const code = 'show = true;\n';
    const param = makeParam('show', 'true', code);
    expect(replaceParamValueForTest(code, param, 'false')).toBe('show = false;\n');
  });

  it('replaces a quoted string', () => {
    const code = 'label = "hello";\n';
    const param = makeParam('label', '"hello"', code);
    expect(replaceParamValueForTest(code, param, '"world"')).toBe('label = "world";\n');
  });

  it('handles string value containing a semicolon — regex fallback cannot do this', () => {
    const code = 'label = "foo;bar";\n';
    // rawValue is the full string literal including quotes
    const param = makeParam('label', '"foo;bar"', code);
    expect(replaceParamValueForTest(code, param, '"baz"')).toBe('label = "baz";\n');
  });

  it('replaces a vector value', () => {
    const code = 'size = [10, 20, 30];\n';
    const param = makeParam('size', '[10, 20, 30]', code);
    expect(replaceParamValueForTest(code, param, '[15, 25, 35]')).toBe('size = [15, 25, 35];\n');
  });

  it('handles param at offset 0 (start of file)', () => {
    const code = '10';
    const param = makeParam('x', '10', code, 0);
    expect(replaceParamValueForTest(code, param, '99')).toBe('99');
  });

  it('handles param at the very end of the file', () => {
    const code = 'x = 10';
    const param = makeParam('x', '10', code);
    expect(replaceParamValueForTest(code, param, '99')).toBe('x = 99');
  });
});

// ─── Stale offset fallback ───────────────────────────────────────────────────

describe('replaceParamValue — stale offset fallback', () => {
  it('falls back to regex when rawValue does not match at stored offsets', () => {
    // Simulate: code was edited after params were parsed — offsets now point to
    // different text. The regex fallback should still find the right assignment.
    const originalCode = 'width = 10;\n';
    const param = makeParam('width', '10', originalCode);
    // Simulate the user having added a character, shifting the value
    const editedCode = 'width = 99;\n'; // completely replaced already
    // rawValue ('10') no longer at stored offset → regex kicks in and finds nothing
    // because the assignment already contains '99', not '10'. Result unchanged.
    expect(replaceParamValueForTest(editedCode, param, '15')).toBe('width = 15;\n');
  });

  it('uses regex fallback when no offsets are provided', () => {
    const code = 'height = 20;\n';
    const param = {
      name: 'height',
      rawValue: '20',
      value: 20,
      type: 'number' as const,
      line: 1,
      // no valueStartIndex / valueEndIndex
    };
    expect(replaceParamValueForTest(code, param, '30')).toBe('height = 30;\n');
  });
});

// ─── Regex fallback — single-line confinement ────────────────────────────────

describe('replaceParamValue — regex fallback correctness', () => {
  it('does not match a named argument (no semicolon on the same line)', () => {
    const code = ['width = 10;', 'cube(width = width,', '     height = 5);'].join('\n');
    // No offsets → regex fallback
    const param = {
      name: 'width',
      rawValue: '10',
      value: 10,
      type: 'number' as const,
      line: 1,
    };
    const result = replaceParamValueForTest(code, param, '20');
    // Only the top-level assignment line changes; named arg line is untouched
    expect(result).toBe(['width = 20;', 'cube(width = width,', '     height = 5);'].join('\n'));
  });

  it('does not corrupt multi-line function call — the original bug', () => {
    const code = [
      'pitch_diameter = 33;  // [8:1:80]',
      '',
      'module gear(pd, n) {',
      '    cylinder(d = pd);',
      '}',
      '',
      'gear(',
      '    pitch_diameter = pitch_diameter,',
      '    num_teeth = 7',
      ');',
    ].join('\n');

    const param = {
      name: 'pitch_diameter',
      rawValue: '33',
      value: 33,
      type: 'slider' as const,
      line: 1,
    };

    const result = replaceParamValueForTest(code, param, '40');

    // First line updated
    expect(result).toContain('pitch_diameter = 40;  // [8:1:80]');
    // Named argument line and rest of function call intact
    expect(result).toContain('    pitch_diameter = pitch_diameter,');
    expect(result).toContain('    num_teeth = 7');
    expect(result).toContain(');');
  });

  it('does not match param inside a module definition argument', () => {
    const code = ['width = 10;', 'module box(width = 5) {', '    cube(width);', '}'].join('\n');
    const param = {
      name: 'width',
      rawValue: '10',
      value: 10,
      type: 'number' as const,
      line: 1,
    };
    const result = replaceParamValueForTest(code, param, '20');
    expect(result.split('\n')[0]).toBe('width = 20;');
    expect(result).toContain('module box(width = 5)');
  });

  it('replaces only the target param when two differently-named params are on consecutive lines', () => {
    const code = ['width = 10;', 'height = 20;'].join('\n');
    const param = {
      name: 'width',
      rawValue: '10',
      value: 10,
      type: 'number' as const,
      line: 1,
    };
    const result = replaceParamValueForTest(code, param, '99');
    expect(result).toBe(['width = 99;', 'height = 20;'].join('\n'));
  });
});

// ─── Batch / multi-replacement ordering ─────────────────────────────────────

describe('replaceParamValue — batch replacement ordering', () => {
  it('two params: applying in reverse offset order keeps both positions valid', () => {
    // width appears before height in the file
    const code = 'width = 10;\nheight = 20;\n';

    const widthParam = makeParam('width', '10', code);
    const heightParam = makeParam('height', '20', code);

    // height has a higher offset → apply it first
    const afterHeight = replaceParamValueForTest(code, heightParam, '30');
    // width value at its original offset is still '10' because we changed only text after it
    const afterBoth = replaceParamValueForTest(afterHeight, widthParam, '15');

    expect(afterBoth).toBe('width = 15;\nheight = 30;\n');
  });

  it('three params reset in reverse offset order produces correct result', () => {
    const code = 'a = 1;\nb = 2;\nc = 3;\n';

    const aParam = makeParam('a', '1', code);
    const bParam = makeParam('b', '2', code);
    const cParam = makeParam('c', '3', code);

    // Apply c first (highest offset), then b, then a
    let result = code;
    result = replaceParamValueForTest(result, cParam, '30');
    result = replaceParamValueForTest(result, bParam, '20');
    result = replaceParamValueForTest(result, aParam, '10');

    expect(result).toBe('a = 10;\nb = 20;\nc = 30;\n');
  });

  it('replacement that changes value length does not corrupt subsequent earlier-in-file param', () => {
    // Simulates reset where the later param has a longer value
    const code = 'x = 5;\ny = 100;\n';

    const xParam = makeParam('x', '5', code);
    const yParam = makeParam('y', '100', code);

    // Apply y first (higher offset), it changes '100' → '2' (shorter)
    const afterY = replaceParamValueForTest(code, yParam, '2');
    expect(afterY).toBe('x = 5;\ny = 2;\n');

    // x offset is before y, so it is unaffected by the length change
    const afterBoth = replaceParamValueForTest(afterY, xParam, '9');
    expect(afterBoth).toBe('x = 9;\ny = 2;\n');
  });
});
