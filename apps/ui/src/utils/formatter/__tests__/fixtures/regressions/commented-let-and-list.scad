// Regression: comments inside lists and let() bindings should stay attached
function patch_points(w = 10, h = 20,
                      inset = 2, tb = 4) =
    [
        [-w/2 + inset,  h/2  ],  // top-left shoulder
        [ w/2 - inset,  h/2  ],  // top-right shoulder
        [ w/2,          tb/2 ],  // right tip top
        [ w/2,         -tb/2 ],  // right tip bottom
    ];

function corner_hole_pt(raw_pts, arc_centers, i, R, si) =
    let(
        n    = len(raw_pts),
        prev = (i - 1 + n) % n,
        // Inward normals of the two edges meeting at corner i
        n1 = edge_normal(raw_pts[prev], raw_pts[i]),       // incoming edge
        n2 = edge_normal(raw_pts[i], raw_pts[(i+1) % n]),  // outgoing edge
        // Average to get bisector (points inward)
        bx = n1[0] + n2[0],
        by = n1[1] + n2[1]
    )
    [arc_centers[i][0] + bx, arc_centers[i][1] + by];

polygon(points = patch_points());
