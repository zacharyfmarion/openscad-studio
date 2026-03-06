// Test: main file includes a library entry point that itself includes sibling files.
// Simulates the BOSL2 pattern: include <BOSL2/std.scad> where std.scad includes <transforms.scad>
include <mylib/std.scad>

// Use a module defined in shapes.scad (included transitively via std.scad)
myshape();
