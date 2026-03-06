# Phase 6.2: Section/Clipping Plane

## Summary

Implement a single interactive section plane using Three.js global clipping plus a visible, transformable plane gizmo. Ship interior-surface visibility (DoubleSide) first; add true stencil-based cap fill as a follow-on.

## Effort Estimate

- Basic (toggle + presets + slider + gizmo): Medium (1–2 days)
- With stencil-based cap fill: Large (3+ days)

## Action Plan

1. **Clipping plane core**: Create `THREE.Plane`, set `renderer.clippingPlanes = [plane]` on enable, clear on disable.
2. **UI controls**: Toggle button in toolbar, X/Y/Z axis selector, position slider with range from model bounds.
3. **Visual indicator**: Semi-transparent `THREE.Mesh(PlaneGeometry)` aligned to clipping plane, sized from bounding box diagonal × 1.2.
4. **Interaction**: Use `TransformControls` for drag/rotate; disable OrbitControls during plane manipulation.
5. **Preset orientations**: X/Y/Z buttons set plane normal directly. Free rotation derives normal from indicator quaternion.
6. **Material changes**: Set `material.side = DoubleSide` for cross-section visibility. Store originals in `WeakMap` for restore on disable.
7. **Keyboard shortcuts**: `P` toggle, `X/Y/Z` axis, arrow keys nudge offset. Viewer-scoped only.

## Cross-Section Styling (Two-Tier)

### Minimal (ship first)

- `DoubleSide` materials to show interior walls
- Slightly different tint for interior surfaces

### Advanced (follow-on)

- Stencil buffer clipping (like Three.js `webgl_clipping_stencil` example)
- Render clipped backfaces/frontfaces into stencil
- Render cap plane mesh with solid/hatch material where stencil indicates cut

## OrbitControls Integration

```ts
transformControls.addEventListener('dragging-changed', (e) => {
  orbit.enabled = !e.value;
});
```

## State Management

- Clipping plane state: `{ active, axis, offset, rotation }`
- Stored in ThreeViewer component state
- Reset on disable: restore all mutated material props, dispose indicator mesh + transform controls

## Edge Cases

- Clipping plane outside model bounds → subtle UI hint
- No visible geometry after clipping → "No geometry visible at this offset"
- Material sharing → mutate carefully, always restore via WeakMap
