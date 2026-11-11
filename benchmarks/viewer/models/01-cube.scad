// Benchmark model: trivial solid. Measures the fixed per-render overhead
// (WASM instance start-up, font mounting, viewer load) with ~no geometry.
cube([20, 20, 20], center = true);
