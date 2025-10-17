import * as Parser from 'web-tree-sitter';

const code = `assert(r >= 10, "Parameter r must be >= 10");`;

async function test() {
  await Parser.init();
  const parser = new Parser();
  const OpenSCAD = await Parser.Language.load('./node_modules/tree-sitter-openscad/tree-sitter-openscad.wasm');
  parser.setLanguage(OpenSCAD);
  
  const tree = parser.parse(code);
  const root = tree.rootNode;
  
  console.log('Root:', root.toString());
  console.log('\nChildren:');
  for (let i = 0; i < root.childCount; i++) {
    const child = root.child(i);
    console.log(`  [${i}] ${child?.type}: "${child?.text}"`);
    if (child && child.childCount > 0) {
      for (let j = 0; j < child.childCount; j++) {
        const grandchild = child.child(j);
        console.log(`    [${j}] ${grandchild?.type}: "${grandchild?.text}"`);
      }
    }
  }
}

test();
