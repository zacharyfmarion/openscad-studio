// Benchmark model: boolean-heavy part. A hollow rounded shell with a dense
// field of ventilation holes — representative of enclosures and lampshades.
// Tens of thousands of triangles, dominated by OpenSCAD evaluation time.
$fn = 96;

radius = 40;
height = 90;
wall = 2.4;
rows = 14;
per_row = 36;

difference() {
  hull() {
    cylinder(r = radius, h = height - radius / 2);
    translate([0, 0, height - radius / 2]) scale([1, 1, 0.5]) sphere(r = radius);
  }

  translate([0, 0, wall])
    hull() {
      cylinder(r = radius - wall, h = height - radius / 2 - wall);
      translate([0, 0, height - radius / 2 - wall])
        scale([1, 1, 0.5]) sphere(r = radius - wall);
    }

  for (row = [0 : rows - 1], i = [0 : per_row - 1])
    rotate([0, 0, (i + (row % 2) / 2) * 360 / per_row])
      translate([radius - wall * 2, 0, 8 + row * 4.4])
        rotate([0, 90, 0]) cylinder(d = 3.2, h = wall * 4, $fn = 12);
}
