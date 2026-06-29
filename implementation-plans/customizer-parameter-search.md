# Customizer Parameter Search & Filters

## Goal

Implement [issue #149](https://github.com/zacharyfmarion/openscad-studio/issues/149): let users
free-text search customizer parameters and filter them with a persistent chip row (mock
"Customizer Search - Option B"). Chips cover **All**, **Edited** (count of overridden params),
and one chip per parameter category. Search + chip filters compose.

## Approach

- Add two reusable UI primitives under `apps/ui/src/components/ui/`:
  - `SearchInput` — text input with a leading search icon and optional clear button.
  - `FilterChip` — pill button with selected state, optional leading dot, optional count badge.
- Add a customizer-specific composition `CustomizerFilterBar` under
  `apps/ui/src/components/customizer/` that lays out the search input + horizontally scrollable
  chip row (All / Edited / category chips), matching the mock.
- Wire search + filter state into `CustomizerPanel`:
  - Derive dirty (edited) param keys and category list from the already-grouped tabs.
  - Filter the rendered tabs/groups/params by the active chip + normalized search query.
  - Show the filter bar only when it is useful (>4 visible params or >1 category); show the chip
    row only when there is something to filter (edited params or multiple categories).
  - Render a "no matches" empty state with a clear action when filters hide everything.

## Affected Areas

- `apps/ui/src/components/ui/SearchInput.tsx` (new)
- `apps/ui/src/components/ui/FilterChip.tsx` (new)
- `apps/ui/src/components/ui/index.ts` (exports)
- `apps/ui/src/components/customizer/CustomizerFilterBar.tsx` (new)
- `apps/ui/src/components/CustomizerPanel.tsx` (state + filtering + render)
- `apps/ui/src/components/__tests__/CustomizerPanel.test.tsx` (coverage)

## Checklist

- [x] Add `SearchInput` reusable component
- [x] Add `FilterChip` reusable component
- [x] Export new primitives from `ui/index.ts`
- [x] Add `CustomizerFilterBar` composition
- [x] Wire search + filter state and filtering into `CustomizerPanel`
- [x] Add "no matches" empty state
- [x] Add/adjust unit tests
- [x] Run baseline validation (`format:check`, `lint`, `type-check`, `test:unit` — all pass)
- [ ] Open draft PR against `main`
