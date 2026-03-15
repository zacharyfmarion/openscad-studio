# 2D Measurement UX Overhaul

## Goal

Turn 2D measurement into a dedicated inspection tool with live preview, smart snapping, persistent measurements, and clearer management UI.

## Approach

- [x] Capture the implementation plan in `implementation-plans/` before code changes.
- [x] Replace the single armed measurement state with a dedicated interaction mode plus draft + committed measurement state.
- [x] Add a dedicated 2D measurement controller/helper for:
  - [x] screen-space snapping
  - [x] candidate ranking
  - [x] draft lifecycle
  - [x] committed measurement creation
- [x] Extend overlay rendering to support:
  - [x] draft line and label
  - [x] snap indicator and hint
  - [x] multiple committed measurements
  - [x] selected measurement highlighting
- [x] Add a compact measurements tray with selection, delete, and clear-all actions.
- [x] Update keyboard handling:
  - [x] `M` toggles distance mode
  - [x] `Esc` cancels draft or exits mode
  - [x] `Delete/Backspace` removes selected measurement
- [x] Keep measurements render-local and clear them on SVG reload.
- [x] Add or update unit, component, and e2e coverage for the new measurement UX.

## Notes

- Keep `SvgViewer` public props unchanged.
- Keep snapping v1 focused on origin, bounds anchors, and grid intersections.
- Keep wheel zoom active in measure mode, but disable click-to-pan while measuring.
