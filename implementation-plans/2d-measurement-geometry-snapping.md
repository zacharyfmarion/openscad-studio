# 2D Measurement Geometry Snapping

## Goal

Let 2D measurement snap to the actual rendered SVG geometry instead of only semantic anchors, and only allow grid snapping when the grid is visible.

## Approach

- [x] Capture the implementation plan before changing code.
- [x] Add a geometry-snapping helper that can inspect rendered SVG elements and find the nearest point on supported geometry.
- [x] Prioritize geometry snap targets over semantic anchors when they are within threshold.
- [x] Restrict grid snapping so it only participates when both grid visibility and grid snapping are enabled.
- [x] Add or update focused unit and component coverage for geometry snapping and grid-snap gating.
- [x] Run focused verification on the touched viewer files.

## Notes

- Support exact snapping for simple primitives first and path sampling for arbitrary SVG paths.
- Keep the public `SvgViewer` API unchanged.
