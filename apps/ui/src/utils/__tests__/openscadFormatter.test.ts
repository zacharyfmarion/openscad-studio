import { formatOpenScadCode } from '../openscadFormatter';

describe('formatOpenScadCode', () => {
  it('preserves compact angle brackets in use/include statements', () => {
    const input = `// Import the library (modules/functions only; no top-level geometry executed)
use <lib/holes.scad>
use <lib/line.scad>
use <lib/spacing_utils.scad>`;

    const result = formatOpenScadCode(input);

    expect(result)
      .toBe(`// Import the library (modules/functions only; no top-level geometry executed)
use <lib/holes.scad>
use <lib/line.scad>
use <lib/spacing_utils.scad>
`);
  });

  it('normalizes spacing for conditional blocks while preserving comments', () => {
    const input = `module example(){// leading comment
if(true){// first branch
cube(1);
}else if(false){/* keep block */cube(2);
}else{
// final branch
cube(3);
}
}`;

    const result = formatOpenScadCode(input);

    expect(result).toBe(`module example() {// leading comment
    if (true) {// first branch
        cube(1);
    } else if (false) {/* keep block */cube(2);
    } else {
        // final branch
        cube(3);
    }
}
`);
  });

  it('trims excessive blank lines and ensures a trailing newline', () => {
    const input = `cube(1);



sphere(2);`;

    const result = formatOpenScadCode(input);

    expect(result).toBe(`cube(1);

sphere(2);
`);
  });

  it('formats comparison and assignment operators without splitting multi-character tokens', () => {
    const input = `module metrics(){
if(total<=limit){
value+=1;
}else if(total>=limit){
value-=2;
}
if(value!=baseline){
return value==baseline;
}
}`;

    const result = formatOpenScadCode(input);

    expect(result).toBe(`module metrics() {
    if (total <= limit) {
        value += 1;
    } else if (total >= limit) {
        value -= 2;
    }
    if (value != baseline) {
        return value == baseline;
    }
}
`);
  });

  it('indents nested control flow and loops inside modules', () => {
    const input = `module tree(levels){
for(level=[0:levels-1]){
if(level==0){
cube([1,1,1]);
}else{
translate([0,0,level]){
rotate([0,0,45]){
cylinder(h=level+1,r=level/2);
}
}
}
}
}`;

    const result = formatOpenScadCode(input);

    expect(result).toBe(`module tree(levels) {
    for (level = [0:levels - 1]) {
        if (level == 0) {
            cube([1, 1, 1]);
        } else {
            translate([0, 0, level]) {
                rotate([0, 0, 45]) {
                    cylinder(h = level + 1, r = level / 2);
                }
            }
        }
    }
}
`);
  });

  it('does not treat import-like content inside strings or comments as actual imports', () => {
    const input = `// Example mentioning use <fake.scad> should stay intact
echo("use <fake.scad> inside string");
/* include <fake.scad> */
module noop(){
return;
}`;

    const result = formatOpenScadCode(input);

    expect(result).toBe(`// Example mentioning use <fake.scad> should stay intact
echo("use <fake.scad> inside string");
/* include <fake.scad> */
module noop() {
    return;
}
`);
  });
});
