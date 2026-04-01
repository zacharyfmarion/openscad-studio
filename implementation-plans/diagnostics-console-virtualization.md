# Diagnostics Console Virtualization

## Goal

Virtualize the Diagnostics / Console panel so large render output and diagnostic histories stay responsive without changing the current sectioned presentation of echo output versus diagnostics.

## Approach

- Keep the existing Diagnostics panel entry point and rendering styles, but transform the list into a row model that can be windowed.
- Measure the scroll container height in the panel, render only the visible rows plus overscan, and preserve sticky section headers for the Output and Diagnostics groups.
- Add focused component tests that cover empty state, section rendering, and virtualization behavior for long lists.

## Affected Areas

- `apps/ui/src/components/DiagnosticsPanel.tsx`
- `apps/ui/src/components/__tests__/DiagnosticsPanel.test.tsx`

## Checklist

- [x] Create plan file
- [x] Implement virtualization in the Diagnostics / Console panel
- [x] Preserve Output and Diagnostics section behavior with sticky headers
- [x] Add or update component tests for the virtualized list
- [x] Run targeted formatting and validation
- [x] Create a draft PR against `main`
