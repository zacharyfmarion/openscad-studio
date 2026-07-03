# WASM Export Manifold → CGAL Fallback

## Goal

Mitigate `RuntimeError: indirect call signature mismatch` crashes during export by adding a silent manifold→CGAL fallback in `exportService.ts`.

## Approach

The manifold backend in openscad-wasm@0.0.4 can crash the WASM runtime with `indirect call signature mismatch` for certain geometry + format combinations. This is a known Emscripten/WASM compilation artifact — it's a function table type mismatch inside the WASM module, not something we can fix client-side without updating the WASM binary (which isn't available).

The fix catches this specific error and retries the export with the CGAL backend, which uses a more stable code path. The fallback is transparent to the user.

## Affected Areas

- `apps/ui/src/services/exportService.ts` — add try/catch with CGAL fallback
- `apps/ui/src/services/__tests__/exportService.test.ts` — add test for fallback path

## Checklist

- [x] Add manifold→CGAL fallback in `exportModelWithContext`
- [x] Add unit test covering the fallback path
- [x] Run validation (baseline scope)
- [x] Open draft PR against main
