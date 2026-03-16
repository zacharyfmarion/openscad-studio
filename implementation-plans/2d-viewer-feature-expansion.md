# 2D Viewer Feature Expansion

## Goal

Upgrade the SVG preview into a fabrication-oriented 2D viewer while staying frontend-only and reusing the repo's existing theme, settings, preview, and test infrastructure.

## Approach

- [x] Capture the implementation plan in `implementation-plans/` before code changes.
- [ ] Refactor `SvgViewer` into clear layers:
  - [x] SVG loading/parsing
  - [x] viewport transform and interaction state
  - [x] overlay rendering
- [ ] Add helper utilities for:
  - [x] SVG metrics parsing
  - [x] viewport coordinate conversion and fitting
  - [x] overlay model generation
- [x] Preserve authored SVG geometry styling; only apply safe sizing attributes.
- [ ] Add robust viewer states:
  - [x] idle
  - [x] loading
  - [x] ready
  - [x] empty
  - [x] error
- [x] Preserve the last good SVG while a new SVG is loading or if the new load fails.
- [ ] Add fabrication-oriented 2D tools:
  - [x] zoom in / out
  - [x] fit to drawing
  - [x] 100% scale
  - [x] grid toggle
  - [x] measurement mode
- [ ] Add overlay layers:
  - [x] adaptive grid
  - [x] origin marker
  - [x] optional axes
  - [x] drawing bounds
  - [x] cursor coordinate HUD
  - [x] measurement line and readout
- [x] Add keyboard shortcuts scoped to the focused 2D viewer.
- [x] Extend `settingsStore` and `SettingsDialog` with persisted 2D viewer settings.
- [x] Add or expand tests for helper logic, settings defaults, viewer rendering states, and 2D interactions.

## Affected Areas

- `apps/ui/src/components/SvgViewer.tsx`
- `apps/ui/src/components/SettingsDialog.tsx`
- `apps/ui/src/stores/settingsStore.ts`
- `apps/ui/src/components/__tests__/...`
- `e2e/tests/rendering/render-2d.spec.ts`

## Notes

- Keep `[data-preview-svg] svg` intact so preview capture in `App.tsx` continues to work.
- Do not change `Preview`, `RenderKind`, or the render pipeline contract.
- Keep measurement state ephemeral to the current render.
