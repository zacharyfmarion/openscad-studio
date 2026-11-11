// Benchmark model: a dense procedural surface built as a single polyhedron.
// ~160k triangles of smooth, continuous geometry — representative of
// terrain, lithophanes and scanned/organic meshes.
n = 200;
size = 180;
base = 6;

function height(x, y) =
  base + 10
  + 6 * sin(x * 4.1) * cos(y * 3.3)
  + 3 * sin((x + y) * 9.7)
  + 1.5 * cos(x * 23) * sin(y * 19);

step = size / n;
top = [for (j = [0 : n], i = [0 : n]) [i * step, j * step, height(i, j)]];
bottom = [for (j = [0 : n], i = [0 : n]) [i * step, j * step, 0]];
points = concat(top, bottom);

function t(i, j) = j * (n + 1) + i;
function b(i, j) = (n + 1) * (n + 1) + j * (n + 1) + i;

top_faces = [for (j = [0 : n - 1], i = [0 : n - 1]) each [
  [t(i, j), t(i, j + 1), t(i + 1, j + 1)],
  [t(i, j), t(i + 1, j + 1), t(i + 1, j)],
]];
bottom_faces = [for (j = [0 : n - 1], i = [0 : n - 1]) each [
  [b(i, j), b(i + 1, j + 1), b(i, j + 1)],
  [b(i, j), b(i + 1, j), b(i + 1, j + 1)],
]];
side_faces = [for (k = [0 : n - 1]) each [
  [t(k, 0), t(k + 1, 0), b(k + 1, 0)], [t(k, 0), b(k + 1, 0), b(k, 0)],
  [t(k + 1, n), t(k, n), b(k, n)], [t(k + 1, n), b(k, n), b(k + 1, n)],
  [t(0, k + 1), t(0, k), b(0, k)], [t(0, k + 1), b(0, k), b(0, k + 1)],
  [t(n, k), t(n, k + 1), b(n, k + 1)], [t(n, k), b(n, k + 1), b(n, k)],
]];

polyhedron(points = points, faces = concat(top_faces, bottom_faces, side_faces), convexity = 4);
