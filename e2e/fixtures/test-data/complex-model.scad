// A more complex model to test rendering performance
module rounded_box(size, radius) {
    hull() {
        for (x = [radius, size.x - radius])
            for (y = [radius, size.y - radius])
                for (z = [radius, size.z - radius])
                    translate([x, y, z])
                        sphere(r = radius, $fn = 16);
    }
}

module mounting_hole(depth) {
    cylinder(r = 2, h = depth + 1, $fn = 24);
}

difference() {
    rounded_box([40, 30, 15], 3);

    // Hollow interior
    translate([2, 2, 2])
        cube([36, 26, 12]);

    // Mounting holes
    for (pos = [[5, 5, -1], [35, 5, -1], [5, 25, -1], [35, 25, -1]])
        translate(pos)
            mounting_hole(15);
}
