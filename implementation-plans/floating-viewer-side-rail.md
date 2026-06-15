# Floating Viewer Side Rail

## Goal

Replace the bordered 2D and 3D viewer side rails with floating vertical tool buttons that sit over the viewer surface.

## Approach

- Keep the existing 2D and 3D tool definitions and interaction behavior intact.
- Move the desktop-only palettes into the viewer surface so they no longer consume a fixed rail column.
- Remove the palette container width, padding, and border while preserving button active, disabled, tooltip, and click isolation behavior.

## Affected Areas

- `apps/ui/src/components/SvgViewer.tsx`
- `apps/ui/src/components/ThreeViewer.tsx`
- `apps/ui/src/components/three-viewer/ViewerToolPalette.tsx`

## Checklist

- [x] Capture the implementation plan before code changes.
- [x] Update the 2D viewer tool palette to float over the preview surface.
- [x] Update the 3D viewer tool palette to float over the preview surface.
- [x] Run formatting and validation for the changed frontend files.
- [x] Prepare the branch and draft PR handoff.
