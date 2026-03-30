# Viewer Annotation Tool

## Goal

Add a shared annotation mode for the 2D and 3D viewers that lets users draw box, oval, and freehand marks on the current preview, then attach the annotated image directly to the AI chat while focusing the chat composer.

## Approach

- Build a shared viewer-annotation module for normalized shape state, Konva overlay rendering, and annotated image export/compositing.
- Extend both viewer tool systems with an `annotate` mode and a compact annotation control panel.
- Add a workspace-level attach action that opens the AI panel, queues the exported image through the existing attachment pipeline, and focuses the prompt.
- Cover the new geometry/export logic with unit tests and add viewer integration coverage for the attach flow and main failure cases.

## Affected Areas

- `apps/ui/src/components/ThreeViewer.tsx`
- `apps/ui/src/components/SvgViewer.tsx`
- `apps/ui/src/components/viewer-annotation/*`
- `apps/ui/src/components/three-viewer/*`
- `apps/ui/src/contexts/WorkspaceContext.tsx`
- `apps/ui/src/App.tsx`
- `apps/ui/src/analytics/runtime.tsx`
- `apps/ui/src/utils/capturePreview.ts`
- `apps/ui/src/utils/captureSvgPreviewImage.ts`
- `apps/ui/src/hooks/useAiAgent.ts`
- `apps/ui/src/components/__tests__/*`
- `apps/ui/package.json`

## Checklist

- [x] Add dependencies and shared annotation module scaffolding
- [x] Implement normalized annotation state, Konva overlay rendering, and annotated export helpers
- [x] Integrate annotation mode and controls into the 3D viewer
- [x] Integrate annotation mode and controls into the 2D viewer
- [x] Add workspace-level AI attach action, focus behavior, and analytics wiring
- [x] Add or update automated tests for annotation logic and viewer attachment flows
- [x] Run formatting and deterministic validation for the changed scope
