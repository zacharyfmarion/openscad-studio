// Test: 3-level deep nested includes.
// main -> mylib/entry.scad -> mylib/sub/deep.scad
include <mylib/entry.scad>

// Use a module defined in deep.scad (included transitively via entry.scad)
deep_shape();
