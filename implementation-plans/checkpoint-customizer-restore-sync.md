# Checkpoint Customizer Restore Sync

## Goal
Ensure restoring an AI checkpoint updates the customizer panel so controls added by the reverted turn disappear immediately.

## Approach
- Trace the restore event flow through the AI, workspace, and customizer layers.
- Patch the restore/customizer integration at the narrowest point that guarantees the panel refreshes against restored code.
- Add regression coverage for restoring a checkpoint after an AI-added customizer control.

## Affected Areas
- `apps/ui/src/hooks/useAiAgent.ts`
- `apps/ui/src/App.tsx`
- `apps/ui/src/components/panels/PanelComponents.tsx`
- related frontend tests

## Checklist
- [x] Inspect restore and customizer sync flow
- [x] Implement the restore/customizer panel fix
- [x] Add regression coverage for restored-away customizer controls
- [x] Run targeted validation
