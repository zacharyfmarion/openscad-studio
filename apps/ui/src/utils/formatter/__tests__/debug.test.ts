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

  it('should be idempotent - if-else without braces', async () => {
    const input = `if (a) cube(1); else sphere(2);`;

    const once = await formatOpenScadCode(input);
    const twice = await formatOpenScadCode(once);

    console.log('\n=== IDEMPOTENCE DEBUG ===');
    console.log('Input:', JSON.stringify(input));
    console.log('Once:', JSON.stringify(once));
    console.log('Twice:', JSON.stringify(twice));

    const onceLines = once.split('\n');
    const twiceLines = twice.split('\n');

    console.log('\n=== LINE COMPARISON ===');
    const maxLines = Math.max(onceLines.length, twiceLines.length);
    for (let i = 0; i < maxLines; i++) {
      if (onceLines[i] !== twiceLines[i]) {
        console.log(`Line ${i + 1} DIFFERS:`);
        console.log(`  Once:  ${JSON.stringify(onceLines[i] || '(missing)')}`);
        console.log(`  Twice: ${JSON.stringify(twiceLines[i] || '(missing)')}`);
      }
    }

    expect(twice).toBe(once);
  });
});
