# AI 2D Diagnostics Dimension Fallback

## Goal

Root-cause and fix the AI `get_diagnostics` false positive where valid 2D render targets report `Current top level object is not a 3D object.` even though the preview renders successfully as a 2D SVG.

## Approach

- Confirm how AI diagnostics differ from the live preview render path.
- Add a shared render-service helper that recognizes pure 2D/3D top-level mismatch diagnostics.
- Update both WASM and native syntax checks to retry the opposite dimension when the first pass only fails because of a view mismatch.
- Add regression coverage for the fallback behavior and context forwarding.

## Affected Areas

- `apps/ui/src/services/renderService.ts`
- `apps/ui/src/services/nativeRenderService.ts`
- `apps/ui/src/services/__tests__/renderService.test.ts`
- `apps/ui/src/services/__tests__/nativeRenderService.test.ts`

## Checklist

- [x] Inspect the AI diagnostics and preview render paths to identify the root cause.
- [x] Implement dimension-mismatch fallback for syntax checks in the shared render services.
- [x] Add regression tests for WASM and native syntax checks.
- [x] Run targeted validation and update this plan with the completed steps.
