# 3D viewer benchmark

A repeatable benchmark for the part of OpenSCAD Studio that turns code into an
interactive 3D preview: the WASM render, OFF parsing, mesh upload, and the
orbit / hover / zoom / measure interactions on the result.

It drives the **production web build** in Chromium through Playwright, so it
measures the same pipeline users get — not a synthetic harness.

```bash
pnpm bench:viewer -- --label before          # run everything, save results/before.json
# …make changes…
pnpm bench:viewer -- --build --label after   # rebuild the web app, run again
pnpm bench:viewer:compare benchmarks/viewer/results/before.json benchmarks/viewer/results/after.json
```

The first run builds `apps/web/dist` if it does not exist. Pass `--build` after
changing app code, otherwise the previous bundle is measured again.

## Models

- `models/*.scad` — a small committed corpus written for this benchmark (no
  third-party code, so no licensing concerns). It spans a trivial cube, a
  typical bracket, a many-colored assembly, a boolean-heavy shell, a dense
  smooth surface, a crease-heavy knurled array and a ~1M-triangle stress test.
- **Your own models** — put `.scad` files in
  `~/Documents/datasets/openscad-studio-bench/` (picked up automatically when
  it exists), or point at any folder with `--dataset <dir>` /
  `OPENSCAD_BENCH_DATASET`. This is the place for real-world or
  non-redistributable models that should not be committed.
  - Every `.scad` file is treated as an entry point. Other `.scad` files in the
    same directory (and below) are provided to the renderer so sibling
    `include`/`use` statements resolve. `../` includes are not supported.
  - List library-only files or folders in a `.benchignore` file at the dataset
    root (one relative path per line) to skip them as entry points.
  - Models that fail to render, render as 2D, or exceed `--render-timeout` are
    reported as skipped rather than failing the run.

## What is measured

Per model, with the render cache cleared each time:

| Metric | Meaning |
| --- | --- |
| `render ms` | OpenSCAD (WASM) evaluation + OFF export, as seen by the app. |
| `viewer load ms` | Render finished → mesh parsed, mounted and a frame presented. |
| `parse ms` | OFF → geometry time as experienced by the app (includes worker round trip). The JSON also has `workerParseMs` / `workerBvhMs` when parsing ran off the main thread. |
| `idle frames/2s` | Frames the viewer drew during 2 s with no input. Should be 0. |
| `hover script ms` | Main-thread JS time while sweeping the pointer over the model (no buttons). |
| `hover raycast ms` | Mean cost of one hover pick. |
| `orbit frame p50/p95 ms` | Frame interval while drag-orbiting. Lower is smoother. |
| `orbit script ms` | Main-thread JS time for the whole orbit sweep. |
| `zoom frame p95 ms` | Frame interval while wheel-zooming in and out. |
| `measure raycast ms` | Mean cost of one pick with the distance-measure tool active. |
| `measure frame p95 ms` | Frame interval while moving the pointer with the measure tool active. |
| `heap MB` | JS heap after the model has loaded and settled. |

Load metrics are the median of `--iterations` runs (default 3). Interaction
scenarios run once and move the pointer one step per animation frame, so frame
intervals reflect the true per-frame cost. The full JSON report contains more
detail (max frame time, total task time, raycast p95/max, viewer frame counts).

The app only emits these timings when `window.__OPENSCAD_STUDIO_PERF__` is set
before boot (see `apps/ui/src/utils/perfProbe.ts`); normal sessions pay nothing.

## Options

```
--label <name>         Name for this run (results/<name>.json). Default: run
--filter <text>        Only run models whose name contains <text>
--dataset <dir>        Extra folder of .scad models (see above)
--no-builtin           Skip models/ and only run the dataset
--iterations <n>       Load iterations per model (default 3)
--steps <n>            Pointer steps per interaction sweep (default 120)
--viewport <WxH>       Browser viewport (default 1440x900)
--render-timeout <s>   Per-render timeout in seconds (default 180)
--build                Run `pnpm web:build` first
--dist <dir>           Serve a different build output (e.g. a saved baseline)
--url <url>            Benchmark an already running app instead of serving dist
--headed               Show the browser (recommended on a real GPU)
--channel <name>       Playwright browser channel, e.g. chrome
--executable <path>    Explicit Chromium binary (or OPENSCAD_BENCH_CHROMIUM)
--out <file>           Write the JSON report somewhere else
```

## Getting trustworthy numbers

- **Compare runs from the same machine, browser and viewport only.** The report
  records the WebGL renderer, CPU and viewport so mismatches are visible.
- On a desktop, run `--headed --channel chrome` so the real GPU is used.
  Headless Chromium often falls back to software rendering (SwiftShader), where
  frame times are dominated by rasterization; script-time, raycast, parse and
  idle-frame metrics remain meaningful there, absolute frame times do not.
- Close other heavy apps; the WASM render and software GL both use spare cores.
- To compare against an older commit without rebuilding back and forth, copy its
  `apps/web/dist` somewhere and pass it with `--dist`.
- The desktop app renders with the native OpenSCAD binary, so `render ms` here
  is web-only. Everything after the render (parse, viewer, interactions) is
  shared code and applies to both platforms.
