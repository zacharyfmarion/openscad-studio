# Customizer Collapsible Sections

## Goal

Let users collapse and expand the customizer's parameter groups (the section
headers like BASE, STEM, SHADE shown above each block of controls) so long
parameter lists stay manageable and users can focus on the section they're
editing.

## Approach

- Treat each top-level customizer section (`tab`, rendered when `showTabHeaders`
  is true) as the collapsible unit. These correspond to OpenSCAD customizer
  `/* [Group] */` groups and are what the user sees as section headers.
- Add session-local `collapsedSections` state (a `Set<string>` keyed by section
  name) in `CustomizerPanel`, mirroring the established collapse pattern in
  `DiagnosticsPanel.tsx`.
- Turn the section header into an accessible toggle button with a chevron
  (`TbChevronDown`/`TbChevronRight`), `aria-expanded`, and a subtle parameter
  count so users get feedback when a section is collapsed.
- When the user is actively filtering/searching, force sections expanded so
  matches are never hidden behind a collapsed header.
- Sections without a header (single unnamed "Parameters" group) are unaffected —
  there is nothing to collapse.

## Affected Areas

- `apps/ui/src/components/CustomizerPanel.tsx` — collapse state, toggle handler,
  collapsible section header markup.
- `apps/ui/src/components/__tests__/CustomizerPanel.test.tsx` — coverage for
  collapse/expand and the force-expand-while-filtering behavior.

## Checklist

- [x] Add collapse state + toggle handler
- [x] Render collapsible section header with chevron + count
- [x] Hide section bodies when collapsed; force expand while filtering
- [x] Add/extend component tests
- [x] Run baseline validation
- [x] Open draft PR against main (#152)
