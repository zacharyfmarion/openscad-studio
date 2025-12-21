/**
 * Test utilities for formatter tests
 */

import * as fs from 'fs';
import * as path from 'path';

/**
 * Read a test fixture file
 */
export function readFixture(fixturePath: string): string {
  const fullPath = path.join(__dirname, 'fixtures', fixturePath);
  return fs.readFileSync(fullPath, 'utf-8');
}

/**
 * Get all test cases in a fixtures directory
 * Returns pairs of [inputPath, expectedPath]
 */
export function getTestCases(
  fixturesDir: string
): Array<{ name: string; input: string; expected: string }> {
  const fullDir = path.join(__dirname, 'fixtures', fixturesDir);

  if (!fs.existsSync(fullDir)) {
    return [];
  }

  const files = fs.readdirSync(fullDir);
  const testCases: Array<{ name: string; input: string; expected: string }> = [];

  // Find all .scad files that don't end with .expected.scad
  const inputFiles = files.filter((f) => f.endsWith('.scad') && !f.endsWith('.expected.scad'));

  for (const inputFile of inputFiles) {
    const baseName = inputFile.replace(/\.scad$/, '');
    const expectedFile = `${baseName}.expected.scad`;

    if (files.includes(expectedFile)) {
      const inputPath = path.join(fullDir, inputFile);
      const expectedPath = path.join(fullDir, expectedFile);

      testCases.push({
        name: `${fixturesDir}/${baseName}`,
        input: fs.readFileSync(inputPath, 'utf-8'),
        expected: fs.readFileSync(expectedPath, 'utf-8'),
      });
    }
  }

  return testCases;
}

/**
 * Get all test cases recursively from fixtures directory
 */
export function getAllTestCases(): Array<{ name: string; input: string; expected: string }> {
  const fixturesRoot = path.join(__dirname, 'fixtures');

  if (!fs.existsSync(fixturesRoot)) {
    return [];
  }

  const testCases: Array<{ name: string; input: string; expected: string }> = [];

  function scan(dir: string, relativePath: string = '') {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isDirectory()) {
        scan(path.join(dir, entry.name), path.join(relativePath, entry.name));
      } else if (
        entry.isFile() &&
        entry.name.endsWith('.scad') &&
        !entry.name.endsWith('.expected.scad')
      ) {
        const baseName = entry.name.replace(/\.scad$/, '');
        const expectedFile = `${baseName}.expected.scad`;
        const expectedPath = path.join(dir, expectedFile);

        if (fs.existsSync(expectedPath)) {
          const inputPath = path.join(dir, entry.name);
          const testName = path.join(relativePath, baseName);

          testCases.push({
            name: testName,
            input: fs.readFileSync(inputPath, 'utf-8'),
            expected: fs.readFileSync(expectedPath, 'utf-8'),
          });
        }
      }
    }
  }

  scan(fixturesRoot);
  return testCases;
}

/**
 * Create a colored diff string for better test output
 */
export function createDiff(expected: string, actual: string): string {
  const expectedLines = expected.split('\n');
  const actualLines = actual.split('\n');
  const maxLines = Math.max(expectedLines.length, actualLines.length);

  let diff = '\n';
  diff += 'Expected vs Actual:\n';
  diff += '==================\n';

  for (let i = 0; i < maxLines; i++) {
    const exp = expectedLines[i] ?? '';
    const act = actualLines[i] ?? '';

    if (exp !== act) {
      diff += `Line ${i + 1}:\n`;
      diff += `  Expected: ${JSON.stringify(exp)}\n`;
      diff += `  Actual:   ${JSON.stringify(act)}\n`;
    }
  }

  return diff;
}
