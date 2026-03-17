# 3D Viewer Inspection Foundation

## Goal

Make the 3D viewer feel first-class for inspection work by introducing a cleaner internal architecture, shared measurement tray UI, and an MVP inspection toolset with selection, measurements, and sectioning.

## Approach

- [x] Capture the implementation plan before changing code.
- [x] Extract shared measurement presentation UI that both 2D and 3D viewers can use.
- [x] Keep 2D and 3D measurement engines separate while reusing the shared tray shell.
- [x] Refactor `ThreeViewer` internals around stable scene/helper/overlay groupings.
- [x] Add viewer-scoped interaction modes for orbit, inspect, distance measurement, bbox measurement, and section plane.
- [x] Add dedicated 3D viewer helpers/controllers for picking, measurement math, section-plane math, and material mutation.
- [x] Add selection highlighting and inspection HUD feedback.
- [x] Add point-to-point 3D measurements with snapping, draft state, committed state, selection, delete, and clear-all.
- [x] Add bbox measurement mode for full-model and selected-object extents.
- [x] Add section-plane controls, helper visualization, and clipping behavior.
- [x] Extend sticky 3D viewer settings only where they improve the feature ergonomics.
- [x] Add unit/component coverage for shared tray and 3D math helpers.
- [ ] Add or extend 3D viewer integration/e2e coverage for inspection workflows.

## Notes

- Keep the external `Preview -> ThreeViewer` contract intact.
- Treat the current viewcube and framing/autofit behavior as existing functionality, not part of this implementation scope.
- Reset 3D selection, measurements, and section state whenever the loaded geometry changes.
