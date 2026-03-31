# Color Preview Support

## Goal

Add `color()` support to 3D preview, share thumbnails, and AI off-angle screenshots by switching the internal 3D preview artifact from STL to color-preserving OFF and rendering multi-material Three.js meshes in the frontend.

## Approach

- [x] Capture the implementation plan before changing code.
- [x] Switch the internal 3D preview render artifact from STL to OFF while keeping external export behavior unchanged.
- [x] Add a repo-native OFF parser and shared Three.js preview model builder for live preview and offscreen screenshots.
- [x] Replace STL-specific 3D preview loading with color-aware grouped meshes while preserving existing viewer interactions.
- [x] Generalize STL-named screenshot/share/AI preview plumbing to generic 3D preview source naming.
- [x] Add or update unit/component coverage for OFF parsing, render-service behavior, viewer compatibility, and screenshot/share integrations.
- [x] Run targeted validation for the changed frontend behavior and record any intentionally skipped checks.
- [x] Harden OFF face handling and normal generation to avoid shading artifacts on complex CSG output.
- [x] Add a viewer setting that disables model colors for live preview and offscreen captures while preserving geometry loading.

## Affected Areas

- `apps/ui/src/services/renderService.ts`
- `apps/ui/src/hooks/useOpenScad.ts`
- `apps/ui/src/components/ThreeViewer.tsx`
- `apps/ui/src/services/offscreenRenderer.ts`
- `apps/ui/src/services/aiService.ts`
- `apps/ui/src/components/ShareDialog.tsx`
- `apps/ui/src/App.tsx`
- `apps/ui/src/stores/settingsStore.ts`
- `apps/ui/src/components/settings/ViewerSettings.tsx`
- `apps/ui/src/components/SettingsDialog.tsx`
- `apps/ui/src/services/__tests__/*`
- `apps/ui/src/components/__tests__/*`
- `apps/ui/src/stores/__tests__/*`
- New shared OFF parsing / preview-model utilities under `apps/ui/src/services/`

## Checklist

- [x] Create the implementation plan.
- [x] Update render-service preview output to use OFF for 3D previews.
- [x] Add shared OFF parsing and preview-model construction utilities.
- [x] Update the 3D viewer to render grouped color-aware meshes.
- [x] Update offscreen capture, share thumbnails, and AI screenshots to use the generic 3D preview source.
- [x] Add or update tests for parser, render service, viewer, and capture/share/AI flows.
- [x] Run validation and summarize results.
- [x] Replace naive OFF face handling with a more robust triangulation and normal-generation pipeline.
- [x] Add a persisted viewer setting to disable model colors and explain its effect in settings copy.
- [x] Thread the color preference through the live viewer, share thumbnails, and AI screenshot capture.
- [x] Extend tests for the hardened OFF parser and new viewer setting behavior.
