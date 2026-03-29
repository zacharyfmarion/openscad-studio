# Header Workspace Switcher

## Goal

Replace the web header's "Download for Mac" split button with a compact workspace layout switcher for AI, Edit, and Customize, plus a standalone Mac download icon button with a tooltip.

## Approach

- Extend the shared segmented control so it can render compact icon + label options in addition to the existing text-only usage.
- Reuse the existing workspace preset and settings persistence flow from `App.tsx` so header switching updates both the active layout and the saved default layout.
- Replace the download split button with a single icon button that points at the detected macOS release asset and exposes a "Download for Mac" tooltip.
- Add focused tests around the new segmented control behavior used by the header.

## Affected Areas

- `apps/ui/src/App.tsx`
- `apps/ui/src/components/ui/SegmentedControl.tsx`
- `apps/ui/src/analytics/runtime.tsx`
- `apps/ui/src/components/ui/__tests__/SegmentedControl.test.tsx`

## Checklist

- [x] Create plan file
- [x] Extend segmented control for compact icon + label options
- [x] Replace header download split button with workspace switcher and icon download button
- [x] Add or update focused frontend tests
- [x] Run targeted validation
