// Test file for formatter
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
