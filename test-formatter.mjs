// Quick test of the formatter
// This would need to be run in a browser environment since it uses WASM

const testCode = `// Test file for formatter
module test_module(x = 10, y = 20) {
  cube([x, y, -1]);

  // Multi-line let block
  translate([0,0,0])
  let(a=1,b=2,c=3)
  cube([a,b,c]);

  // Multi-line function call
  cylinder(h=10,r1=5,r2=3,$fn=50);
}

function test_function(x,y,z)=x+y+z;

// Test negative numbers
a = -1;
b = -2.5;
c = 1 + -3;
`;

console.log('Test code:', testCode);
console.log('\n--- To test the formatter, open the app and use Cmd+Shift+F ---');
