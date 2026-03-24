# Customizer E2E Flake Hardening

## Goal

Root-cause the slow, first-run flaky customizer E2E failures and harden both the panel and its tests so the suite waits on stable readiness states and uses durable selectors wherever possible.

## Approach

- Reproduce the customizer panel spec in isolation to identify whether the first-run delay comes from parser startup, renderer startup, or brittle panel activation/waiting.
- Add or reuse explicit customizer readiness hooks and stable test ids instead of relying on visible text or fixed timeouts.
- Update the customizer Playwright spec to wait for those stable signals and avoid text-only selectors where the UI already has a better identity.
- Re-run the focused suite, including repeated first-run style executions, to verify the flake is resolved and runtime improves.

## Affected Areas

- `implementation-plans/customizer-e2e-flake-hardening.md`
- `e2e/tests/panels/customizer-panel.spec.ts`
- `e2e/fixtures/app.fixture.ts`
- `apps/ui/src/components/CustomizerPanel.tsx`
- `apps/ui/src/components/customizer/ParameterControl.tsx`

## Checklist

- [x] Inspect the customizer panel spec, helpers, and parser startup path
- [x] Reproduce the first-run flake locally and identify the main bottleneck
- [x] Add stable hooks or helpers needed for deterministic customizer readiness
- [x] Update the spec to use durable selectors and readiness waits
- [x] Re-run the focused customizer suite enough times to check first-run stability
- [x] Summarize the root cause, fix, and any residual risks
