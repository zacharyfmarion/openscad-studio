# Cascade Shortcuts Help Menu

## Goal

Adapt Cascade's centralized keyboard shortcut system for OpenSCAD Studio so shortcuts live in one registry, the app can surface a keyboard shortcuts reference, and both the web menubar and desktop native menu expose a Help menu entry for it.

## Approach

Port the shared shortcut primitives from Cascade, tailor the registry to OpenSCAD Studio's current actions, add modal UI for keyboard shortcuts and app info, and replace the ad hoc App-level keyboard listener with the centralized dispatcher while keeping existing editor- and viewer-specific shortcuts intact.

## Affected Areas

- `apps/ui/src/App.tsx`
- `apps/ui/src/components/WebMenuBar.tsx`
- `apps/ui/src/platform/eventBus.ts`
- `apps/ui/src/platform/tauriBridge.ts`
- `apps/ui/src/stores/settingsStore.ts`
- `apps/ui/src-tauri/src/lib.rs`
- `apps/ui/src/shortcuts/`
- `apps/ui/src/components/`

## Checklist

- [x] Inspect Cascade's shortcut and help menu implementation alongside the current Studio menu/shortcut flows
- [x] Add a shared shortcut registry, dispatcher, and display formatting adapted for Studio actions
- [x] Add keyboard shortcuts and about modals driven by the shared registry
- [x] Replace the ad hoc global shortcut listener in `App.tsx` with the centralized shortcut hook
- [x] Add Help menu entries in both the web menubar and the Tauri native menu
- [x] Add or update automated coverage for the new shortcut/help behavior
- [x] Run shared validation for the affected files
- [ ] Create a draft PR against `main` and capture the preview URL if one is produced
