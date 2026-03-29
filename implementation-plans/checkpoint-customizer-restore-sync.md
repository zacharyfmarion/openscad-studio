# Checkpoint Customizer Restore Sync

## Goal
Ensure restoring an AI checkpoint updates the customizer panel so controls added by the reverted turn disappear immediately.

## Approach
- Trace the restore event flow through the AI, workspace, and customizer layers.
- Route checkpoint restores through the same `code-updated` pipeline as other non-customizer edits instead of relying on a restore-only side channel.
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
