# Remaining E2E Failures

## Goal

Resolve the remaining Playwright e2e failures for PR #30 by distinguishing test-selector drift from real regressions and updating code or tests as needed without disturbing unrelated uncommitted work.

## Approach

- Reproduce the currently failing specs locally.
- Inspect the settings dialog and customizer panel behavior against the current UI.
- Fix product regressions where behavior changed unintentionally.
- Update e2e selectors/assertions where the refactor changed valid UI structure or copy.
- Re-run the affected specs to confirm the failures are resolved.

## Affected Files

- `e2e/tests/panels/customizer-panel.spec.ts`
- `e2e/tests/integration/keyboard-shortcuts.spec.ts`
- `e2e/tests/integration/full-workflow.spec.ts`
- `apps/ui/src/components/CustomizerPanel.tsx`
- `apps/ui/src/components/SettingsDialog.tsx`

## Checklist

- [x] Inspect linked CI failures and current uncommitted changes
- [x] Reproduce failing specs locally
- [x] Fix remaining settings dialog e2e failures
- [x] Fix remaining customizer panel failures
- [x] Re-run targeted e2e specs
- [x] Summarize changes and any residual risk
