# AI Turn Checkpoint Restore Selection

## Goal
Ensure restoring an AI checkpoint reverts code to the state from immediately before the user submitted that AI prompt, including turns that make multiple AI edits.

## Approach
- Capture the first successful `apply_edit` checkpoint in a turn and ignore later checkpoint tokens from the same turn.
- Keep restore execution flowing through the normal `code-updated` path so editor and customizer state stay synchronized.
- Add hook regression coverage for multi-edit turns, malformed later checkpoint tokens, and error-after-success turns.

## Affected Areas
- `apps/ui/src/hooks/useAiAgent.ts`
- `apps/ui/src/hooks/__tests__/useAiAgent.test.tsx`

## Checklist
- [x] Inspect restore and customizer sync flow
- [x] Implement first-checkpoint-wins behavior for AI turns
- [x] Add regression coverage for multi-edit and partial-failure restore cases
- [x] Run targeted validation
