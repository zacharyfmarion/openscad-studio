# Web WASM Text Rendering

## Goal

Fix web `text()` rendering by bundling a small fallback font set for the WASM renderer and mounting it into the OpenSCAD virtual filesystem before renders run.

## Approach

- Add repo-owned web font assets plus `fonts.conf` in a shared UI asset location.
- Create a reusable helper that loads the bundled font bytes, mounts them into the WASM filesystem, and can be exercised directly in tests.
- Update the web worker to preload font assets during init and mount them into every fresh WASM instance before rendering.
- Add regression coverage for 2D and 3D text output and update SVG empty-state copy to describe unsupported custom-font cases more precisely.
- Run targeted tests and baseline validation, then prepare branch/PR handoff.

## Affected Areas

- `apps/ui/src/assets/openscad-fonts/*`
- `apps/ui/src/services/openscad-wasm-fonts.ts`
- `apps/ui/src/services/openscad-worker.ts`
- `apps/ui/src/components/SvgViewer.tsx`
- `apps/ui/src/services/__tests__/*`
- `THIRD-PARTY-LICENSES.md`

## Checklist

- [x] Inspect current web render path and upstream `openscad-wasm` font bootstrap behavior
- [x] Add bundled font assets and attribution metadata
- [x] Implement reusable WASM font loading and mounting helper
- [x] Update worker init/render flow to use bundled fonts
- [x] Tighten `SvgViewer` empty-state copy for unsupported custom-font cases
- [x] Add regression tests for bundled-font 2D and 3D text rendering
- [x] Run targeted tests and shared baseline validation
- [ ] Prepare branch/PR handoff summary
