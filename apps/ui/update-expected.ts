import { formatOpenScadCode, initFormatter } from './src/utils/formatter/index';
import fs from 'fs';
import path from 'path';

const __dirname = process.cwd();

await initFormatter();

const fixturesDir = path.join(__dirname, 'src/utils/formatter/__tests__/fixtures');

// Find all .scad files (not .expected.scad)
function findScadFiles(dir: string): string[] {
  const files: string[] = [];
  const items = fs.readdirSync(dir, { withFileTypes: true });
  for (const item of items) {
    const fullPath = path.join(dir, item.name);
    if (item.isDirectory()) {
      files.push(...findScadFiles(fullPath));
    } else if (item.isFile() && item.name.endsWith('.scad') && !item.name.endsWith('.expected.scad')) {
      files.push(fullPath);
    }
  }
  return files;
}

const scadFiles = findScadFiles(fixturesDir);
console.log(`Found ${scadFiles.length} .scad files`);

let updated = 0;
for (const scadFile of scadFiles) {
  const expectedFile = scadFile.replace(/\.scad$/, '.expected.scad');
  
  const source = fs.readFileSync(scadFile, 'utf-8');
  const formatted = await formatOpenScadCode(source);
  
  // Write formatted output as expected
  fs.writeFileSync(expectedFile, formatted, 'utf-8');
  updated++;
  
  if (updated % 10 === 0) {
    console.log(`Updated ${updated}/${scadFiles.length} files...`);
  }
}

console.log(`✓ Updated ${updated} expected files`);
