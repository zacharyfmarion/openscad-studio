// Benchmark model: many moderately detailed parts in one render — an array
// of knurled knobs on a base plate. Several hundred thousand triangles with
// lots of sharp creases and small faces, which is the hard case for
// hover/measure raycasting.
cols = 6;
rows = 5;
pitch = 26;

module knurled_knob(d = 20, h = 14, teeth = 60, layers = 28) {
  step = h / layers;
  for (layer = [0 : layers - 1])
    translate([0, 0, layer * step])
      linear_extrude(step, twist = (layer % 2 == 0 ? 1 : -1) * 360 / teeth, slices = 2)
        polygon([for (i = [0 : teeth * 2 - 1])
          let (a = i * 180 / teeth, r = d / 2 - (i % 2) * 0.9)
            [r * cos(a), r * sin(a)]]);
  translate([0, 0, h]) cylinder(d1 = d - 2, d2 = d - 5, h = 1.5, $fn = teeth);
}

translate([-pitch / 2, -pitch / 2, -3]) cube([cols * pitch, rows * pitch, 3]);
for (x = [0 : cols - 1], y = [0 : rows - 1])
  translate([x * pitch, y * pitch, 0]) knurled_knob();
