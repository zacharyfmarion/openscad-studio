// Customizer parameters
width = 10; // [5:50]
height = 20; // [5:100]
radius = 3; // [1:10]

difference() {
    cube([width, width, height], center = true);
    cylinder(r = radius, h = height + 1, center = true, $fn = 32);
}
