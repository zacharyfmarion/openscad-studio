# E2E Stable Selectors And Preview Sync

## Goal

Resolve the remaining web e2e failures by replacing brittle selectors with stable test ids, synchronizing rendering assertions with test-only preview state, and hardening initial app navigation in the Playwright fixture.

## Approach

- Add or reuse durable `data-testid` hooks where tests currently depend on copy or layout.
- Add fixture helpers for atomic render updates and stable preview-state waits.
- Update the failing 2D, 3D, and settings specs to use those helpers and stable selectors.
- Add a bounded retry around the initial `page.goto('/')` setup path to reduce late-suite startup flakes.
- Re-run the deterministic failures first, then the affected flaky suites, then the combined web slice under CI-like settings.

## Affected Areas

- `e2e/fixtures/app.fixture.ts`
- `e2e/tests/rendering/render-2d.spec.ts`
- `e2e/tests/rendering/render-3d.spec.ts`
- `e2e/tests/settings/settings.spec.ts`
- `apps/ui/src/components/SvgViewer.tsx`
- `apps/ui/src/components/ThreeViewer.tsx`
- `apps/ui/src/components/SettingsDialog.tsx`

## Checklist

- [x] Inspect the failing CI job and confirm deterministic vs flaky failures
- [x] Add stable test hooks needed by the remaining failing specs
- [x] Add fixture helpers for render synchronization and startup retry
- [x] Update the failing 2D, 3D, and settings e2e specs
- [x] Re-run the deterministic failures locally
- [x] Re-run the affected customizer and diagnostics suites
- [x] Re-run the combined affected web slice with `CI=1`
- [x] Summarize results and any residual risk
