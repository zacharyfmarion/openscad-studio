// Benchmark model: many differently-colored solids. Every distinct color
// becomes its own mesh/material in the viewer, so this stresses draw-call
// count and per-mesh overhead rather than raw triangle count.
count = 12;
pitch = 12;

for (x = [0 : count - 1], y = [0 : count - 1]) {
  h = 4 + 10 * (0.5 + 0.5 * sin(x * 37) * cos(y * 53));
  color([x / (count - 1), y / (count - 1), 0.4 + 0.5 * ((x + y) % 3) / 2])
    translate([x * pitch, y * pitch, 0])
      if ((x + y) % 2 == 0)
        cylinder(d = 9, h = h, $fn = 48);
      else
        translate([0, 0, h / 2]) cube([8, 8, h], center = true);
}

color("dimgray") translate([-pitch / 2, -pitch / 2, -2])
  cube([count * pitch, count * pitch, 2]);
