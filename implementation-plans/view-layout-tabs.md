# View Layout Tabs

## Goal

Move the console into the preview/customizer tab group for the AI-first desktop layout, and make mobile open with the viewer active while all other panels live as tabs in that same area.

## Approach

- Update the dock layout preset builder to support a mobile-specific arrangement and the revised AI-first tab grouping.
- Choose the mobile arrangement during Dockview initialization on small screens.
- Add focused tests around the layout builder so the panel placement is covered.

## Affected Areas

- `apps/ui/src/stores/layoutStore.ts`
- `apps/ui/src/App.tsx`
- `apps/ui/src/stores/__tests__/layoutStore.test.ts`

## Checklist

- [x] Create plan file
- [x] Update desktop AI-first layout so console is a tab beside preview/customizer
- [x] Add mobile layout mode with preview active and remaining panels grouped as tabs
- [x] Wire Dockview initialization to use the mobile layout on small screens
- [x] Add or update tests for the new layout behavior
- [x] Run targeted verification
