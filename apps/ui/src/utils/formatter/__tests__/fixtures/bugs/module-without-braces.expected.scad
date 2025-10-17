// Module without braces should preserve body
module simple() cube(10);

module with_chain() translate([5, 0, 0]) sphere(3);

module G() offset(0.3) text("G", font = "Arial", size = 10);
