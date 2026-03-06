# 3D Viewer: Adaptive Render Resolution + Section/Clipping Plane — Implementation Plan

## Overview

Make the preview truly responsive by observing the dockview panel container size, converting it into a quantized, DPR-aware render target, and threading that `{w,h,dpr}` through the existing render debounce + cache. Then add a clipping-plane mode in Three.js using `renderer.clippingPlanes`, with a minimal first milestone (clip only) and a second milestone (stencil-based section fill + plane gizmo).

**Effort estimate:** Medium (1–2 days) for 6.1 + basic 6.2 (no fill); Large (3d+) with stencil section fill + polished gizmo.

---

# Feature 6.1 — Adaptive Render Resolution

## 1) ResizeObserver Setup

- Attach to preview panel container element (React component hosting Three.js canvas)
- Use `ResizeObserverEntry.contentRect.width/height` (CSS pixels)
- Debounce: separate `liveSize` (immediate, for CSS/canvas) from `stableSize` (300ms debounce, for worker renders)

## 2) Resolution Calculation

- `computeViewportSpec(cssW, cssH, dpr)` → `{ dprUsed, targetW, targetH }`
- DPR cap: `Math.min(window.devicePixelRatio ?? 1, 2)`
- Minimum: 400×300 CSS pixels (or skip render if collapsed)
- Maximum: 1920×1080 target pixels (or `maxPixels = 2_000_000`)
- **Quantization**: Round to 32px steps to reduce cache fragmentation

## 3) Render Pipeline Changes

- Extend `renderPreview()` + worker message schema with `targetW/targetH`
- Cache key: include viewport bucket (`codeHash:WxH:settingsHash`)
- Three.js: `renderer.setPixelRatio(dprUsed)`, `renderer.setSize(cssW, cssH, false)`, update camera aspect

## 4) Performance

- During active resize: show last good render scaled via CSS
- Only trigger worker render after 300ms stable debounce
- Optional "upgrade on idle" (render at base quality first, full quality after 750ms idle)

## 5) Edge Cases

- Panel collapsed (< 2px): skip rendering; queue "pending render on expand"
- Panel not visible: gate renders behind visibility state
- Multiple preview panels: per-panel size state + per-panel cache keys

---

# Feature 6.2 — Section / Clipping Plane

## 1) UI Design

- Toggle button in 3D viewer toolbar: "Section" (on/off)
- Controls: axis preset buttons (X/Y/Z + flip), offset slider, reset
- Visual: translucent plane quad + PlaneHelper outline

## 2) Three.js Implementation

- `renderer.localClippingEnabled = true`
- Single `THREE.Plane` applied to materials via `material.clippingPlanes`
- PlaneHelper sized to bounding box diagonal
- **Section fill** (milestone 2): Stencil approach
  1. Render backfaces: increment stencil where clipped
  2. Render frontfaces: decrement stencil where clipped
  3. Render plane-aligned quad with stencil test ≠ 0 for section color

## 3) Interaction Model

- Offset slider controls `plane.constant`
- Axis presets: X/Y/Z set normal; Shift+X/Y/Z flips
- Optional: TransformControls for free move/rotate (disable OrbitControls while dragging)
- Keyboard: X/Y/Z for axis, R for reset, P for helper visibility toggle

## 4) UX Considerations

- Initial position: center of mesh bounding box, normal +Z
- Separate "Section Enabled" from "Show Plane Helper" toggles
- Reset: center + +Z + slider to 0
- Stencil fallback: if unavailable, disable "Fill" toggle

## 5) Edge Cases

- Plane outside model bounds: naturally shows whole model
- Very thin models: polygonOffset on fill quad to reduce z-fighting
- 2D mode: disable section UI; show "Section applies to 3D only"
- Multiple planes: implement state as array-capable for future extension

---

# Combined Implementation Steps

1. **Viewport measurement plumbing** (ResizeObserver + quantization + DPR cap)
2. **Three.js responsive viewport** (renderer size + pixelRatio + camera aspect from liveSize)
3. **Dynamic render sizing** (extend renderPreview + worker with targetW/targetH)
4. **Cache key update** (viewport bucket in hash; verify cache hit behavior)
5. **Section toggle + basic clipping** (THREE.Plane, material clipping, PlaneHelper)
6. **Section controls + interaction** (axis presets, offset slider, reset, helper visibility)
7. **Section fill** (stencil 2-pass + fill quad + fallback to clip-only)
