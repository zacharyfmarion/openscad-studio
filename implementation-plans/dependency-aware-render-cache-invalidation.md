# Dependency-Aware Render Cache Invalidation

## Goal

Fix stale renders when imported or included files change by making cache invalidation depend on the full render input set rather than only the render target source and auxiliary file count.

## Approach

- Introduce a shared render cache fingerprint derived from the render target source and all resolution-affecting render options.
- Update both render services to use that fingerprint consistently for `getCached()` and `render()`.
- Refactor `useOpenScad` so dependency resolution happens before cache lookup and manual renders update version bookkeeping correctly.
- Add regression tests for cache invalidation across auxiliary file content changes, render target path changes, and dependency-only edits.

## Affected Areas

- `apps/ui/src/services/renderService.ts`
- `apps/ui/src/services/nativeRenderService.ts`
- `apps/ui/src/hooks/useOpenScad.ts`
- `apps/ui/src/services/__tests__/renderService.test.ts`
- `apps/ui/src/hooks/__tests__/useOpenScad.test.tsx`

## Checklist

- [x] Add a shared dependency-aware render cache fingerprint helper.
- [x] Update WASM and native render cache usage to key on full render inputs.
- [x] Resolve dependencies before cache lookup in `useOpenScad` and sync manual render version tracking.
- [x] Add regression tests for dependency-content and input-path cache invalidation.
- [x] Run targeted tests plus `scripts/validate-changes.sh` for the changed scope.
- [x] Commit, push, open a draft PR against `main`, and report the preview URL if applicable.
