// Benchmark model: stress test. Two very finely tessellated spheres (about a
// million triangles total). Larger than most real projects — use it to find
// the ceiling for load time, orbit smoothness and raycast cost.
$fn = 720;

sphere(r = 30);
translate([75, 0, 0]) sphere(r = 30);
