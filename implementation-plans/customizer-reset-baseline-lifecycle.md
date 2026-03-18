# Customizer Reset Baseline Lifecycle

## Goal
Make customizer reset behavior follow the active tab's last non-customizer code state instead of relying on an `App.tsx`-local baseline that can drift out of sync.

## Approach
- Move customizer baseline ownership into workspace tab state.
- Update non-customizer code paths to advance both tab content and the tab's customizer baseline.
- Keep customizer-originated edits changing tab content only.
- Add regression coverage for welcome-tab file open and tab baseline behavior.

## Affected Areas
- `apps/ui/src/stores/workspaceTypes.ts`
- `apps/ui/src/stores/workspaceFactories.ts`
- `apps/ui/src/stores/workspaceStore.ts`
- `apps/ui/src/App.tsx`
- `apps/ui/src/contexts/WorkspaceContext.tsx`
- `apps/ui/src/components/panels/PanelComponents.tsx`
- related unit tests

## Checklist
- [x] Add per-tab customizer baseline state and store action
- [x] Remove app-local customizer baseline state and use tab-backed baseline
- [x] Update non-customizer code flows to advance the tab baseline
- [x] Add regression tests for workspace tab baseline behavior and customizer reset detection
- [x] Run targeted verification
