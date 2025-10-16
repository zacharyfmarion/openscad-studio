/**
 * Formatter test suite using file-based fixtures
 */

import { formatOpenScadCode, initFormatter } from '../index';
import { getAllTestCases, createDiff } from './test-utils';

// Increase timeout for WASM initialization
jest.setTimeout(30000);

describe('OpenSCAD Formatter', () => {
  // Initialize formatter once before all tests
  beforeAll(async () => {
    await initFormatter();
  });

  describe('Fixture Tests', () => {
    const testCases = getAllTestCases();

    if (testCases.length === 0) {
      it('should have test fixtures', () => {
        throw new Error('No test fixtures found. Add .scad files to __tests__/fixtures/');
      });
    }

    testCases.forEach(({ name, input, expected }) => {
      describe(name, () => {
        it('should format correctly', async () => {
          const actual = await formatOpenScadCode(input);

          if (actual !== expected) {
            const diff = createDiff(expected, actual);
            throw new Error(`Formatting mismatch for ${name}:\n${diff}`);
          }

          expect(actual).toBe(expected);
        });

        it('should be idempotent', async () => {
          const formattedOnce = await formatOpenScadCode(input);
          const formattedTwice = await formatOpenScadCode(formattedOnce);

          if (formattedOnce !== formattedTwice) {
            const diff = createDiff(formattedOnce, formattedTwice);
            throw new Error(`Formatter is not idempotent for ${name}:\n${diff}`);
          }

          expect(formattedTwice).toBe(formattedOnce);
        });
      });
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty input', async () => {
      const result = await formatOpenScadCode('');
      expect(result).toBe('');
    });

    it('should handle whitespace-only input', async () => {
      const result = await formatOpenScadCode('   \n\n  \n   ');
      expect(result).toBe('');
    });

    it('should handle parse errors gracefully', async () => {
      const invalid = 'module { { { invalid syntax';
      const result = await formatOpenScadCode(invalid);
      // Should return original on parse error
      expect(result).toBeDefined();
    });

    it('should preserve comments', async () => {
      const input = '// Comment\nmodule test() {}';
      const result = await formatOpenScadCode(input);
      expect(result).toContain('// Comment');
      expect(result).toContain('module test()');
    });
  });

  describe('Basic Formatting Rules', () => {
    it('should add space after for keyword', async () => {
      const input = 'for(i=[0:10]){}';
      const result = await formatOpenScadCode(input);
      expect(result).toContain('for (i = [0:10])');
    });

    it('should add space after module keyword', async () => {
      const input = 'module test(){}';
      const result = await formatOpenScadCode(input);
      expect(result).toContain('module test()');
    });

    it('should format binary operators with spaces', async () => {
      const input = 'x=1+2*3;';
      const result = await formatOpenScadCode(input);
      expect(result).toContain('x = 1 + 2 * 3');
    });

    it('should not add space after unary minus', async () => {
      const input = 'x=-1;';
      const result = await formatOpenScadCode(input);
      expect(result).toContain('x = -1');
      expect(result).not.toContain('- 1');
    });

    it('should format single-line arrays compactly', async () => {
      const input = 'cube([ 1 , 2 , 3 ]);';
      const result = await formatOpenScadCode(input);
      expect(result).toContain('[1, 2, 3]');
      expect(result).not.toContain('[ 1');
      expect(result).not.toContain('3 ]');
    });
  });
});
