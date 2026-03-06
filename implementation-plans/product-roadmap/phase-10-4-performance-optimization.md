# Phase 10.4: Performance Optimization

## Summary

Treat "incremental rendering" as **incremental scheduling + progressive fidelity** first (skip/abort redundant renders, show fast preview, upgrade in background). Build a single render scheduler for desktop (multi-process) and web (worker pool), then layer progress UX, cache/LRU, and viewer/editor optimizations.

## Effort Estimate

Large (3d+) overall; deliverable incrementally with value at each step.

## Action Plan

1. **Performance baseline**: add end-to-end timing marks (keystroke→render request→render done→mesh shown), per-stage timers.
2. **Unified Render Scheduler**: priority queue + cancellation + dedupe keyed by semantic hash, with explicit lanes for interactive preview vs high-quality.
3. **Background render pools**: desktop OpenSCAD process pool (N workers) and web Worker pool (N wasm workers).
4. **Progressive preview**: fast settings first (lower `$fn`, reduced resolution), upgrade to full quality when idle; cache both tiers.
5. **Progress UX + timeouts**: indeterminate progress early, "long render" state >5s with cancel/keep-waiting; enforce timeouts and OOM handling.
6. **Optimize Monaco + Three.js hot paths**: throttle costly decorations, optimize mesh upload/disposal, reduce GPU workload during interaction.
7. **WebGPU spike**: evaluate Three.js WebGPU renderer behind a flag; keep WebGL default until benefits proven.

## Incremental Rendering — OpenSCAD CSG Limitations

- OpenSCAD evaluates whole script; any change can affect global geometry
- **What's feasible**:
  - **Incremental avoidance**: detect edits that don't require render (comments/whitespace, unchanged semantic hash)
  - **Progressive fidelity**: render fast preview immediately, refine when idle
  - **Scoped caching** (optional): cache results for isolated modules when provably no cross-child CSG dependencies
- **AST diff strategy**:
  1. Semantic hashing: normalize + strip comments + hash; if unchanged, skip render
  2. Shallow structural parse: bracket balancing to diff at top-level block granularity
  3. Full AST: only if significant wins beyond semantic hashing + progressive preview

## Background Render Pool

**Desktop (CLI):**

- Fixed-size pool: `min(cores-1, 4)`, spawn per job with concurrency cap
- Hard limits: max concurrent renders, max queued jobs, per-job timeout
- Isolation: temp dirs keyed by job hash

**Web (WASM):**

- Worker pool with N dedicated workers, each holding initialized wasm instance
- Use transferable buffers for mesh/preview artifacts

## WebGPU Evaluation

- Feature-flagged with WebGL fallback
- Abstraction: `RendererBackend = WebGL | WebGPU` with identical scene setup
- Benchmark with real workloads: massive STL upload + render, camera orbit, memory
- Expected: STL viewing often CPU/transfer bound first — measure before committing

## Progress Indicator

- Phase states: `Queued → Starting → Rendering → Converting/Loading Mesh → Displaying`
- Indeterminate spinner by default; after 5s switch to "Long render" UI with elapsed time + Cancel
- Estimation: rolling history keyed by semantic hash prefix + settings tier

## Render Queue

- Single scheduler controlling both desktop/web backends
- **Priority**: manual render/export > idle preview > background refine > cache warmups
- **Dedup**: coalesce by `(semanticHash, settingsTier, platformBackend)`
- **Cancellation**: cancel superseded interactive jobs on new edits; user cancel kills process/worker
- **Fairness**: reserve at least one worker slot for interactive lane

## Web Worker Optimization

- Prioritize multiple workers before SharedArrayBuffer
- SharedArrayBuffer: only if cross-origin isolation met; mainly for large mesh buffer copies
- Transferable ArrayBuffer usually sufficient and simpler

## Caching Improvements

- LRU with size caps: separate caches per artifact type (`previewPNG`, `meshSTL`, `diagnostics`)
- Max bytes and max entries; evict LRU across tiers
- Two-tier: fast preview + full quality separately
- Partial hits across pipeline stages: reuse parsed code, dependency resolution, mesh if only view settings changed

## Monaco Performance

- Keep keystrokes <100ms
- Throttle expensive operations (lint markers, decorations, code actions) to idle
- Large files: degrade gracefully (disable minimap, reduce tokenization frequency)
- Debounce model updates triggering heavy analysis

## Three.js Optimization

- Convert STL to indexed `BufferGeometry`; compute bounds once; enable frustum culling
- During interaction: temporarily reduce render resolution or pause postprocessing
- LOD (optional): simplified proxy mesh for interaction, swap to full on idle

## Memory Management

- Explicit `dispose()` geometries/materials/textures when replacing previews
- Cap in-flight job count and max artifact bytes; spill to disk/IndexedDB when needed
- Web: periodically recycle workers after heavy jobs if wasm heap grows monotonically

## Startup Optimization

- Lazy load Three.js viewer chunk only when preview pane visible
- Load openscad-wasm only when web rendering needed; warm up after first idle
- Defer non-critical Monaco features until after first interaction
- Prefetch next-likely chunks when CPU idle

## Profiling Strategy

- **Measure**: keystroke latency, time-to-preview, render duration, mesh parse/upload time, memory peak
- **Benchmarks**: 5–10 representative models (simple <500ms target, moderate boolean, pathological >5s)
- **Tooling**: Performance marks in frontend; timing logs in Rust; dev-only perf overlay

## Error Handling

- **Timeout**: interactive preview 10–15s, export longer; show partial (last good) preview + actionable message
- **OOM**: detect from process exit / wasm failure; reduce concurrency, recycle worker, suggest lower quality
- **Worker crash**: auto-respawn + mark job failed; don't deadlock scheduler

## Edge Cases

- **Rapid edits**: aggressive cancellation + dedupe; only latest semantic hash can "win"
- **Very large models**: default to fast tier; require manual opt-in for high-quality
- **Models with errors**: render only after diagnostics go clean or longer debounce; keep last-good preview

## Platform-Specific

- Desktop: multi-process straightforward; leave headroom for typing/Three.js
- Web: memory tighter; worker creation/wasm init expensive — reuse instances

## Metrics

- Local rolling p50/p95 per model/session in dev panel
- Track: job counts, cancellation rate, cache hit rate, average render time per tier, max memory
- Auto-tune concurrency and refine render triggers based on observed performance
