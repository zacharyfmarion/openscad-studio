# Issue 100 2D Viewer Fill Color

## Goal

Make 2D preview geometry render with a solid theme-aware fill color so boolean cutouts are easier to read, while keeping the existing 2D viewer pipeline and geometry styling safeguards intact.

## Approach

- Thread the preview scene's default model color into SVG normalization.
- Normalize OpenSCAD's default light gray fill to the current theme color while preserving explicit non-default geometry styling.
- Add regression coverage for the normalization helper and the 2D viewer render path.
- Validate the changed frontend behavior with the shared validation helper.

## Affected Areas

- `apps/ui/src/components/SvgViewer.tsx`
- `apps/ui/src/components/svg-viewer/parseSvgMetrics.ts`
- `apps/ui/src/components/__tests__/svgViewerHelpers.test.ts`
- `apps/ui/src/components/__tests__/SvgViewer.test.tsx`

## Checklist

- [x] Inspect the issue, repo guidance, and current 2D viewer implementation.
- [x] Implement theme-aware default fill normalization for 2D SVG previews.
- [x] Add or update unit coverage for the fill-color behavior.
- [x] Run formatting and targeted validation for the changed files.
- [ ] Commit, push, open a draft PR against `main`, and wait for the preview result if applicable.
