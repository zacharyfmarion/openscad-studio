import { beforeAll, describe, expect, it, jest } from '@jest/globals';
import { compileOpenScad, formatCompileErrors } from './compile-utils';
import { formatOpenScadCode, initFormatter } from '../index';
import { getTestCaseByName } from './test-utils';

jest.setTimeout(30000);

const curatedFixtureNames = [
  'regressions/commented-let-and-list',
  'regressions/keyboard-layout-inline-comments',
  'regressions/numeric-prefixed-module-calls',
  'parameters/multiline',
  'openscad-examples/advanced/offset',
] as const;

describe('OpenSCAD Formatter Integration', () => {
  beforeAll(async () => {
    await initFormatter();
  });

  curatedFixtureNames.forEach((name) => {
    it(`${name} compiles before and after formatting`, async () => {
      const testCase = getTestCaseByName(name);
      if (!testCase) {
        throw new Error(`Missing curated compile fixture: ${name}`);
      }

      const originalCompile = await compileOpenScad(testCase.input);
      expect(originalCompile.diagnostics.filter((diag) => diag.severity === 'error')).toHaveLength(
        0
      );

      const formattedOnce = await formatOpenScadCode(testCase.input);
      const formattedCompile = await compileOpenScad(formattedOnce);
      if (formattedCompile.diagnostics.some((diag) => diag.severity === 'error')) {
        throw new Error(
          `Formatted output does not compile for ${name}:\n${formatCompileErrors(formattedCompile)}`
        );
      }

      const formattedTwice = await formatOpenScadCode(formattedOnce);
      expect(formattedTwice).toBe(formattedOnce);

      const formattedTwiceCompile = await compileOpenScad(formattedTwice);
      if (formattedTwiceCompile.diagnostics.some((diag) => diag.severity === 'error')) {
        throw new Error(
          `Second format pass does not compile for ${name}:\n${formatCompileErrors(
            formattedTwiceCompile
          )}`
        );
      }
    });
  });
});
