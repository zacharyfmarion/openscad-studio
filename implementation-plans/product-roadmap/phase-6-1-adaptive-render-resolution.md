# Phase 6.1: Adaptive Render Resolution

## Summary

Make the preview's render size a first-class render option derived from the preview panel's live DOM size via `ResizeObserver`, then debounce OpenSCAD re-renders (300ms) while letting the viewer resize immediately. Include render dimensions in the cache key for raster outputs.

## Effort Estimate

Medium (1–2 days)

## Action Plan

1. **Parameterize pipeline**: In `useOpenScad.ts`, replace hardcoded `{ w: 800, h: 600 }` with dynamic `{ w, h }` from callers. Plumb through both `PlatformBridge` implementations.
2. **Add `ResizeObserver`**: In `Preview.tsx`, use `useElementSize(containerRef)` hook → stores `{ cssW, cssH }`.
3. **Compute resolution**: `dpr = Math.min(devicePixelRatio, 2)`, round to nearest 16/32, clamp min/max.
4. **Debounce re-renders**: Update viewer layout immediately, schedule OpenSCAD render after 300ms stable size. Skip if rounded `{ w, h }` unchanged.
5. **Fix cache**: Include `{ w, h }` in cache key for PNG. Exclude for STL (geometry-only) and SVG.
6. **Platform updates**: Desktop → `--imgsize=WxH` flag. Web → WASM viewport sizing.
7. **Per-viewer behavior**: STL → `renderer.setSize` only. PNG → keep old image during render, crossfade. SVG → viewport/fitting only.

## Resolution Calculation

```ts
const dpr = Math.min(window.devicePixelRatio || 1, 2);
const rawW = cssW * dpr;
const rawH = cssH * dpr;
const w = clamp(roundToMultiple(rawW, 16), MIN_W, MAX_W);
const h = clamp(roundToMultiple(rawH, 16), MIN_H, MAX_H);
```

## Edge Cases

- Zero/tiny sizes (collapsed/minimized): ignore until `cssW/cssH >= MIN_*`, render on restore
- Very large panels/monitors: clamp max to avoid slow renders / memory spikes
- Cache explosion: rounding to multiples of 16/32 reduces fragmentation
