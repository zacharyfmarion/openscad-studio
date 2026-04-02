# v1.0 Analytics Coverage

## Goal

Add analytics instrumentation for all new functionality shipped in v1.0 that currently lacks tracking: multi-file project interactions (file tree CRUD, moves, render target changes, tab closes) and viewer annotation workflow events (annotation committed, annotations cleared, annotation attached).

## Approach

- Add `analytics.track()` calls directly in the existing handlers in `App.tsx` using the already-imported `useAnalytics()` hook.
- Add `useAnalytics()` directly to `ThreeViewer.tsx` and `SvgViewer.tsx` (neither currently uses it) and wire calls into the annotation callbacks.
- No new abstractions needed; follows existing inline tracking patterns throughout the codebase.

## Affected Areas

- `apps/ui/src/App.tsx` — 8 new events in multi-file handlers
- `apps/ui/src/components/ThreeViewer.tsx` — 3 new annotation events
- `apps/ui/src/components/SvgViewer.tsx` — 3 new annotation events

## Checklist

- [x] Create implementation plan
- [x] Add multi-file events to `App.tsx` (file created, folder created, file renamed, file deleted, folder deleted, item moved, render target changed, tab closed)
- [x] Add annotation events to `ThreeViewer.tsx` (annotation committed, annotations cleared, annotation attached)
- [x] Add annotation events to `SvgViewer.tsx` (annotation committed, annotations cleared, annotation attached)
- [x] Run baseline validation — format:check, lint, type-check, test:unit all pass (68 suites, 495 tests)
- [x] Open draft PR
