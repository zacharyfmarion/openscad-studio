# Phase 6.4: Measurement Tools

## Summary

Implement Measurement Tools as an overlay "interaction mode" inside `ThreeViewer.tsx`: a controller handles pointer events + raycasting, and a dedicated `measurementsGroup` renders lines/labels independent of the mesh. Click-based distance + bbox labels, with vertex snapping via a lightweight vertex spatial hash.

## Effort Estimate

Medium (1–2 days)

## Action Plan

1. **Viewer mode state + UI**: `viewMode = 'orbit' | 'measure-distance' | 'measure-bbox'`, toolbar toggles, `Esc` to exit.
2. **MeasurementController**: Attached to `renderer.domElement`, performs raycasting on click/move, emits events to React.
3. **Overlay group**: `measurementsGroup: THREE.Group` added to scene; all measurement primitives here, cleared independently.
4. **Distance tool**: 2-click workflow, draw line + label, store measurements array, "clear all" + per-item delete.
5. **Vertex snapping**: Spatial hash built once per mesh load; snap within screen-consistent threshold (~8-12 pixels).
6. **Bounding box tool**: Compute `Box3`, render bbox + dimension lines + X/Y/Z labels.
7. **Testing + QA**: Unit tests for math/formatting; integration tests against known geometry.

## Point Picking

- Raycaster from pointer NDC coordinates
- Intersect only mesh groups (exclude grid helpers, measurement lines)
- Use closest hit `hits[0]` for `point`, `face`, `object`
- No hit → no-op with brief hint

## Label Rendering

- **Recommended: CSS2DRenderer** for crisp text, easy styling, DOM accessibility
- Create one `CSS2DRenderer` alongside WebGL renderer
- Call `labelRenderer.render(scene, camera)` each frame

## Vertex Snapping

```ts
const worldPerPixel = (2 * Math.tan(fov / 2) * depth) / viewportHeight;
const snapThresholdWorld = worldPerPixel * snapPx; // snapPx ~ 8-12
```

- Build spatial hash from `geometry.attributes.position` once per mesh load
- Show snap indicator (small sphere mesh) when snapping active

## OrbitControls Interaction

- Click (pointerdown/up < 3px movement) = pick
- Drag = OrbitControls
- Disable orbit only during active pick to avoid camera jitter

## Multiple Measurements

- Store `measurements: Array<{id, p1Local, p2Local, createdAt}>`
- Measurements panel lists each with distance + delete button + "Clear all"
- Measurements cleared on mesh re-render (geometry may be invalidated)

## Coordinate Systems

- Store picked points in mesh-local coordinates for stability
- Display in "model units" converted to UI unit setting

## Keyboard Shortcuts

- `M` toggle distance tool
- `B` toggle bbox tool
- `Esc` exit tool
- `Delete/Backspace` delete selected measurement

## Edge Cases

- Click empty space → no-op + brief hint
- Zero distance → display `0.00 unit`
- Measurements are straight-line (chord), not geodesic

## Accessibility

- CSS2D labels with `aria-label`
- Measurements panel items keyboard-focusable
- `aria-live="polite"` region for "Measurement added" announcements
