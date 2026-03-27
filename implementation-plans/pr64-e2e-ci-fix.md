# PR 64 E2E / CI Fix

## Goal

Root cause the GitHub Actions e2e failures on PR #64 and fix them with stable selectors so the tooltip refactor does not break Playwright again.

## Approach

- Reproduce the failing Playwright specs locally on the PR branch.
- Replace brittle selector assumptions that depended on native `title` behavior with explicit `data-testid` hooks.
- Restore or improve accessibility where icon-only controls lost an accessible name.
- Re-run the affected specs to confirm the CI failures are resolved.

## Affected Files

- `apps/ui/src/components/SettingsDialog.tsx`
- `apps/ui/src/components/AiPromptPanel.tsx`
- `apps/ui/src/components/ThreeViewer.tsx`
- `apps/ui/src/components/ui/IconButton.tsx`
- `e2e/helpers/editor.ts`
- `e2e/tests/ai/ai-chat.spec.ts`
- `e2e/tests/integration/full-workflow.spec.ts`
- `e2e/tests/integration/keyboard-shortcuts.spec.ts`

## Checklist

- [x] Inspect PR #64 check failures and changed files
- [x] Reproduce the failing Playwright specs locally
- [x] Patch app selectors/accessibility for icon-only buttons touched by the tooltip refactor
- [x] Update e2e tests to use stable selectors
- [x] Verify the previously failing specs locally
- [x] Summarize root cause, fix, and any remaining risk
