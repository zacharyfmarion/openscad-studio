# 2D Viewer Outline And Pinch Zoom

## Goal

Make 2D preview outlines feel less visually heavy and keep macOS trackpad pinch gestures scoped to the 2D viewer instead of triggering whole-page zoom.

## Approach

- Normalize rendered SVG preview geometry so strokes stay non-scaling inside the 2D viewer.
- Add a Safari-friendly pinch gesture guard that prevents browser-level page zoom while the pointer or focus is inside the 2D viewer.
- Cover the changed behavior with helper and component tests, then run the shared validation flow for the touched frontend scope.

## Affected Areas

- `apps/ui/src/components/SvgViewer.tsx`
- `apps/ui/src/components/svg-viewer/parseSvgMetrics.ts`
- `apps/ui/src/components/__tests__/SvgViewer.test.tsx`
- `apps/ui/src/components/__tests__/svgViewerHelpers.test.ts`

## Checklist

- [x] Inspect the existing 2D viewer rendering and interaction flow.
- [x] Create the implementation plan in `implementation-plans/`.
- [x] Update SVG preview rendering so outlines read thinner in the 2D viewer.
- [x] Prevent trackpad pinch gestures from zooming the full page while interacting with the 2D viewer.
- [x] Add or update tests for the viewer rendering and gesture behavior.
- [x] Run formatting and deterministic validation for the touched files.
- [ ] Open a draft PR against `main` and capture the preview URL if one is published.
