# E2E Fixture Load Stability

## Goal

Stabilize Playwright startup in CI by avoiding unnecessary waits for the full browser `load` event during initial app navigation.

## Approach

- [x] Capture the implementation plan before changing code.
- [x] Update the shared Playwright fixture to navigate with `waitUntil: 'domcontentloaded'`.
- [x] Keep the existing app bootstrapping steps after navigation unchanged.
- [x] Re-run the previously failing panel and rendering specs.
