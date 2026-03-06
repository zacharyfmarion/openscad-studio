// Test: use<> instead of include<> with nested includes.
// use<> imports modules/functions but does NOT execute top-level code.
use <mylib/helpers.scad>

// Use a function defined in helpers.scad
cube([helper_size(), helper_size(), helper_size()]);
