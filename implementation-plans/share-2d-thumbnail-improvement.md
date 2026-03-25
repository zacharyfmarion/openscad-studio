# Share 2D Thumbnail And AI Screenshot Improvement Plan

## Summary

2D share links currently upload a thumbnail, but the capture path is effectively a tiny DOM snapshot instead of a proper social-card render.

For the staging share [`Xz8PlsuB`](https://codex-share-staging-rollout.openscad-studio-staging.pages.dev/s/Xz8PlsuB):

- the share record has a `thumbnailUrl`
- the thumbnail endpoint returns a real PNG
- but the PNG is only `90x54`

That means the 2D flow is not "missing thumbnails" so much as generating thumbnails that are too small and too raw to work reliably in social unfurls.

## Root Cause

Current 2D thumbnail generation happens in [`capturePreview.ts`](/Users/zacharymarion/Documents/code/openscad-studio/apps/ui/src/utils/capturePreview.ts):

- it looks for `[data-preview-svg] svg`
- serializes the live SVG DOM
- loads it into an `Image`
- creates a canvas sized to `img.naturalWidth` / `img.naturalHeight`
- exports that canvas directly to PNG

This has a few problems:

1. It preserves the SVG's tiny intrinsic dimensions instead of targeting a social-card size like `1200x630`.
2. It depends on the live viewer DOM being present and fully loaded.
3. It does not frame or scale the 2D content for sharing, so even successful captures can feel too small or visually weak.
4. It silently fails inside the share dialog and falls back to "no thumbnail" behavior without giving us much structured signal.

3D thumbnails do not have this exact problem because they use the offscreen renderer path in [`ShareDialog.tsx`](/Users/zacharymarion/Documents/code/openscad-studio/apps/ui/src/components/ShareDialog.tsx), which explicitly renders at `1200x630`.

## Goal

Make 2D share thumbnails deliberate, deterministic, and social-card sized, and use the same improved SVG image path for the AI screenshot tool.

User-visible result:

- 2D shares generate thumbnails that are large enough for OG/Twitter/Messenger cards
- the thumbnail looks centered and framed, not like a tiny raw export
- thumbnail generation does not depend on whatever zoom level or viewport state the user currently has in the 2D viewer
- AI screenshot capture for 2D previews produces a large, legible image instead of a tiny raw SVG rasterization

## Approach

### 1. Add a dedicated 2D thumbnail renderer

Introduce a utility that renders SVG share thumbnails to a fixed canvas target, for example `1200x630`.

Recommended behavior:

- accept raw SVG markup or the current rendered preview source
- parse the SVG size/viewBox
- render it onto a fixed-size canvas
- scale to fit while preserving aspect ratio
- center the artwork within a padded card area
- fill a stable background color appropriate for the theme/share card
- export PNG output

This should live beside the existing preview capture utilities rather than inside the share dialog.

Likely new file:

- [`apps/ui/src/utils/captureSvgPreviewImage.ts`](/Users/zacharymarion/Documents/code/openscad-studio/apps/ui/src/utils/captureSvgPreviewImage.ts)

### 2. Stop using natural SVG dimensions for social thumbnails

For 2D specifically, do not size the export canvas from `img.naturalWidth` / `img.naturalHeight`.

Instead:

- create a fixed social-card canvas
- compute a fit box with padding
- scale the SVG into that frame

This is the core fix for the current `90x54` output.

### 3. Prefer source-based capture over DOM-fragile capture when possible

The current capture utility scrapes `[data-preview-svg] svg` from the live document. That works, but it ties share-thumbnail generation to the current mounted viewer state.

For a more robust path:

- if the current preview kind is `svg` and the preview source URL is available, fetch the SVG source directly
- render the thumbnail from that SVG source
- only fall back to DOM scraping if the source-based path is unavailable

This avoids accidental dependence on current zoom, overlays, or transient viewer state.

### 4. Reuse the same 2D renderer for AI preview screenshots

The AI tool [`get_preview_screenshot`](/Users/zacharymarion/Documents/code/openscad-studio/apps/ui/src/services/aiService.ts) currently reaches the same weak SVG capture path through [`captureCurrentPreview()`](/Users/zacharymarion/Documents/code/openscad-studio/apps/ui/src/utils/capturePreview.ts).

Update the app wiring so both:

- share thumbnail capture
- AI `get_preview_screenshot` for 2D previews

use the same fixed-size SVG renderer.

The cleanest way to do that is:

- keep the AI tool interface unchanged
- update [`captureCurrentPreview()`](/Users/zacharymarion/Documents/code/openscad-studio/apps/ui/src/utils/capturePreview.ts) to support a source-based SVG capture path
- pass the current SVG preview source from [`App.tsx`](/Users/zacharymarion/Documents/code/openscad-studio/apps/ui/src/App.tsx) into the capture closure used by both AI and sharing

### 5. Keep the 2D share thumbnail visually clean

The thumbnail should not include:

- measurement overlays
- viewer tool chrome
- grid toggles
- coordinate readouts
- panel framing

It should represent the design itself, not the full 2D viewer UI.

### 6. Improve observability for thumbnail generation failures

Right now thumbnail upload failures are only logged with a warning in [`ShareDialog.tsx`](/Users/zacharymarion/Documents/code/openscad-studio/apps/ui/src/components/ShareDialog.tsx).

Add better structured diagnostics while keeping the UX forgiving:

- log whether the attempted thumbnail path was `mesh`, `svg-source`, or `svg-dom`
- log export dimensions
- log when capture returns null vs throws

This can stay in console/dev instrumentation for now.

## Affected Files

- [`apps/ui/src/utils/capturePreview.ts`](/Users/zacharymarion/Documents/code/openscad-studio/apps/ui/src/utils/capturePreview.ts)
- [`apps/ui/src/components/ShareDialog.tsx`](/Users/zacharymarion/Documents/code/openscad-studio/apps/ui/src/components/ShareDialog.tsx)
- [`apps/ui/src/App.tsx`](/Users/zacharymarion/Documents/code/openscad-studio/apps/ui/src/App.tsx)
- [`apps/ui/src/services/aiService.ts`](/Users/zacharymarion/Documents/code/openscad-studio/apps/ui/src/services/aiService.ts) if screenshot descriptions need clarifying later
- [`apps/ui/src/components/Preview.tsx`](/Users/zacharymarion/Documents/code/openscad-studio/apps/ui/src/components/Preview.tsx) if thumbnail capture props need to become more explicit
- [`apps/ui/src/components/SvgViewer.tsx`](/Users/zacharymarion/Documents/code/openscad-studio/apps/ui/src/components/SvgViewer.tsx) only if we need cleaner access to raw SVG source or rendered markup
- New utility:
  - [`apps/ui/src/utils/captureSvgPreviewImage.ts`](/Users/zacharymarion/Documents/code/openscad-studio/apps/ui/src/utils/captureSvgPreviewImage.ts)

## Test Plan

### Unit tests

- parse/render a small SVG and verify the exported canvas target is `1200x630`
- verify aspect ratio is preserved and the artwork is centered within padding
- verify tiny intrinsic SVGs still produce a large thumbnail output
- verify empty/invalid SVG input fails cleanly

### Component/integration tests

- sharing a 2D design calls the 2D thumbnail capture path
- sharing a 3D design still uses the offscreen mesh renderer path
- AI 2D screenshot capture uses the improved SVG renderer path
- failed 2D thumbnail capture does not block share creation

### Manual verification

- create a fresh 2D share in staging
- confirm `/api/share/<id>` returns a non-null `thumbnailUrl`
- confirm `GET /api/share/<id>/thumbnail` returns a PNG around `1200x630`
- confirm `HEAD /api/share/<id>/thumbnail` returns `Content-Type: image/png`
- confirm the AI can request a 2D preview screenshot and receives a legible image
- verify the share card unfurls with the 2D image in Messenger/Discord/Twitter validators

## Checklist

- [x] Add a dedicated fixed-size 2D share thumbnail renderer
- [x] Update share creation to use the new 2D renderer for `previewKind === 'svg'`
- [x] Update AI 2D screenshot capture to use the same renderer
- [x] Keep 3D thumbnail generation unchanged
- [x] Add tests for 2D thumbnail sizing and failure behavior
- [ ] Verify a fresh 2D staging share produces a large thumbnail
- [ ] Verify AI 2D screenshot capture is legible
- [ ] Verify social unfurls use the 2D thumbnail on a fresh URL
