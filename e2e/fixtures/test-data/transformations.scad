translate([15, 0, 0])
    rotate([0, 45, 0])
        cube([10, 10, 10]);

translate([-15, 0, 0])
    scale([1, 2, 0.5])
        sphere(r = 5, $fn = 24);
