/**
 * Debug test file - minimal test for quick iteration
 */

import { formatOpenScadCode, initFormatter } from '../index';

// Increase timeout for WASM initialization
jest.setTimeout(30000);

describe('Debug Formatter Tests', () => {
  beforeAll(async () => {
    await initFormatter();
  });

  it('should format simple comment and call', async () => {
    const input = `// Line 1 comment
// Line 2 comment
Logo(50);
`;

    const expected = `// Line 1 comment
// Line 2 comment
Logo(50);
`;

    const actual = await formatOpenScadCode(input);

    console.log('\n=== INPUT ===');
    console.log(JSON.stringify(input));
    console.log('\n=== EXPECTED ===');
    console.log(JSON.stringify(expected));
    console.log('\n=== ACTUAL ===');
    console.log(JSON.stringify(actual));

    console.log('\n=== LINE BY LINE ===');
    const inputLines = input.split('\n');
    const expectedLines = expected.split('\n');
    const actualLines = actual.split('\n');

    const maxLines = Math.max(inputLines.length, expectedLines.length, actualLines.length);
    for (let i = 0; i < maxLines; i++) {
      console.log(`Line ${i + 1}:`);
      console.log(`  Input:    ${JSON.stringify(inputLines[i] || '(missing)')}`);
      console.log(`  Expected: ${JSON.stringify(expectedLines[i] || '(missing)')}`);
      console.log(`  Actual:   ${JSON.stringify(actualLines[i] || '(missing)')}`);
      if (expectedLines[i] !== actualLines[i]) {
        console.log(`  ❌ MISMATCH`);
      }
    }

    expect(actual).toBe(expected);
  });

  it('should be idempotent', async () => {
    const input = `// Comment
Logo(50);
`;

    const once = await formatOpenScadCode(input);
    const twice = await formatOpenScadCode(once);

    console.log('\n=== IDEMPOTENCE CHECK ===');
    console.log('Formatted once:', JSON.stringify(once));
    console.log('Formatted twice:', JSON.stringify(twice));

    expect(twice).toBe(once);
  });
});
