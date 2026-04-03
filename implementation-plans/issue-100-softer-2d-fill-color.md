# Issue 100 Softer 2D Fill Color

## Goal

Reduce the visual contrast of the 2D SVG fill so previews stay legible without feeling overly saturated, while keeping the darker/lighter behavior aligned with the current theme family.

## Approach

- Keep the 3D preview model color unchanged.
- Add a dedicated 2D SVG fill token derived from background theme colors instead of the accent palette.
- Update the SVG viewer to use the quieter 2D fill token during default-fill normalization.
- Extend tests around preview scene tokens and 2D SVG fill behavior.

## Affected Areas

- `apps/ui/src/services/previewSceneConfig.ts`
- `apps/ui/src/services/__tests__/previewSceneConfig.test.ts`
- `apps/ui/src/components/SvgViewer.tsx`
- `apps/ui/src/components/__tests__/SvgViewer.test.tsx`

## Checklist

- [x] Re-read the repo guidance and sync the branch to latest `main`.
- [x] Add a softer theme-derived 2D fill token in preview scene config.
- [x] Route the SVG viewer through the quieter 2D fill token.
- [x] Update unit coverage for the new token and viewer behavior.
- [ ] Run validation, open a draft PR against `main`, and wait for the preview deployment.
