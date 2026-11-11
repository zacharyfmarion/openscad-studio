// Benchmark model: a typical hobbyist part — a mounting bracket with rounded
// corners, counterbored holes and a gusset. Low thousands of triangles with
// real boolean work.
$fn = 64;

plate = [80, 50, 6];
wall_height = 45;
hole_d = 5.2;
counterbore_d = 9.5;

module rounded_plate(size, r) {
  hull() {
    for (x = [r, size[0] - r], y = [r, size[1] - r])
      translate([x, y, 0]) cylinder(r = r, h = size[2]);
  }
}

module counterbored_hole(d, cb_d, depth) {
  translate([0, 0, -1]) cylinder(d = d, h = depth + 2);
  translate([0, 0, depth - 2.5]) cylinder(d = cb_d, h = 3);
}

difference() {
  union() {
    rounded_plate(plate, 6);
    translate([0, plate[1] - plate[2], 0])
      rotate([90, 0, 0]) translate([0, 0, -plate[2]])
        rounded_plate([plate[0], wall_height, plate[2]], 6);
    for (x = [10, plate[0] - 14])
      translate([x, plate[1] - plate[2], plate[2]])
        rotate([90, 0, 90])
          linear_extrude(4)
            polygon([[0, 0], [-30, 0], [0, 30]]);
  }

  for (x = [14, plate[0] - 14], y = [12, 30])
    translate([x, y, 0]) counterbored_hole(hole_d, counterbore_d, plate[2]);

  for (x = [20, plate[0] / 2, plate[0] - 20])
    translate([x, plate[1] + 1, 28])
      rotate([90, 0, 0]) cylinder(d = hole_d, h = plate[2] + 2);

  translate([plate[0] / 2, 20, -1]) cylinder(d = 22, h = plate[2] + 2);
}
