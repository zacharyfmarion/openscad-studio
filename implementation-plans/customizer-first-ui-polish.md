# Customizer-First UI Polish

## Goal
Make the customizer feel like a polished model configurator by adding a dedicated `Customizer First` preset, richer AI-generated parameter metadata, and a more structured customizer UI that still falls back gracefully when metadata is missing.

## Approach
- Extend the customizer parser/types to understand optional `// @studio {json}` metadata while keeping standard OpenSCAD customizer comments as the compatibility layer.
- Add a `customizer-first` workspace preset and surface focused actions for export, AI refinement, and code editing without removing the existing editor/AI layouts.
- Redesign the customizer panel into grouped, labeled, higher-signal controls with loading, empty, and invalid-metadata fallbacks.
- Cover parser behavior, preset selection, UI rendering, and key interactions with unit and E2E tests.

## Affected Areas
- `apps/ui/src/utils/customizer/*`
- `apps/ui/src/components/CustomizerPanel.tsx`
- `apps/ui/src/components/customizer/ParameterControl.tsx`
- `apps/ui/src/stores/layoutStore.ts`
- `apps/ui/src/stores/settingsStore.ts`
- `apps/ui/src/components/NuxLayoutPicker.tsx`
- `apps/ui/src/components/SettingsDialog.tsx`
- `apps/ui/src/App.tsx`
- `apps/ui/src/contexts/WorkspaceContext.tsx`
- `apps/ui/src/services/aiService.ts`
- related unit and E2E tests

## Checklist
- [x] Extend customizer metadata types and parser for `@studio` annotations with safe fallbacks
- [x] Update AI system prompt guidance to emit customizer-friendly ranges and optional Studio metadata
- [x] Add `customizer-first` preset support in layout store, settings, and NUX flows
- [x] Wire customizer-first actions for export, AI refinement, and code editing through the workspace/app shell
- [x] Redesign the customizer panel and parameter controls with grouping, labels, units, advanced gating, and better states
- [x] Add parser/component/layout tests and expand customizer E2E coverage
- [x] Run targeted verification and mark remaining follow-ups if anything must be deferred
