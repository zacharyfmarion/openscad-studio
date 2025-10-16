#!/usr/bin/env node
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Dynamically import the formatter
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function test() {
  const { formatOpenScadCode, initFormatter } = await import('./src/utils/formatter/index.js');

  console.log('Initializing formatter...');
  await initFormatter();

  const input = readFileSync(join(__dirname, 'src/utils/formatter/__tests__/fixtures/debug/line-offset.scad'), 'utf-8');

  console.log('\nINPUT:');
  console.log(input);
  console.log('\nINPUT LINES:');
  input.split('\n').forEach((line, i) => console.log(`  Line ${i+1}: ${JSON.stringify(line)}`));

  console.log('\n--- FORMATTING ---\n');
  const formatted = await formatOpenScadCode(input);

  console.log('FORMATTED OUTPUT:');
  console.log(formatted);
  console.log('\nFORMATTED LINES:');
  formatted.split('\n').forEach((line, i) => console.log(`  Line ${i+1}: ${JSON.stringify(line)}`));

  console.log('\n--- COMPARISON ---');
  const inputLines = input.split('\n');
  const formattedLines = formatted.split('\n');

  if (inputLines.length !== formattedLines.length) {
    console.log(`Line count mismatch: ${inputLines.length} → ${formattedLines.length}`);
  }

  const maxLines = Math.max(inputLines.length, formattedLines.length);
  for (let i = 0; i < maxLines; i++) {
    const inp = inputLines[i] || '(missing)';
    const out = formattedLines[i] || '(missing)';
    if (inp !== out) {
      console.log(`Line ${i+1} differs:`);
      console.log(`  Input:     ${JSON.stringify(inp)}`);
      console.log(`  Formatted: ${JSON.stringify(out)}`);
    }
  }
}

test().catch(console.error);
