# Measure Tool Scrollable Tray

## Goal

Keep the measure tool panel readable as measurements accumulate by turning the measurements list into a bounded, scrollable region instead of letting the panel content crowd itself.

## Approach

- Constrain the shared 3D tool panel height to the available viewport space and allow its body to shrink correctly.
- Update the 3D and 2D measurement panels so the measurements list owns overflow scrolling while the help text and clear action remain visible.
- Add component test coverage for the new layout contract.

## Affected Areas

- `apps/ui/src/components/three-viewer/panels/ToolPanel.tsx`
- `apps/ui/src/components/three-viewer/panels/MeasurePanel.tsx`
- `apps/ui/src/components/SvgViewer.tsx`
- `apps/ui/src/components/__tests__/MeasurePanel.test.tsx`

## Checklist

- [x] Capture the implementation plan in `implementation-plans/` before code changes.
- [x] Update the shared tool panel and measure panels to support a bounded scrollable list.
- [x] Add or update tests for the scrollable measurements tray behavior.
- [x] Run targeted tests and validation for the changed files.
- [ ] Prepare the branch and draft PR handoff.
