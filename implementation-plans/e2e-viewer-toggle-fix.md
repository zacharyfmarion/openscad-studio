# E2E Viewer Toggle Fix

## Goal

Fix the failing viewer settings end-to-end tests by making the viewer toggle controls reliably interactable in both the app UI and Playwright automation, while keeping CI lint and formatting clean.

## Approach

- Reproduce the failing viewer settings tests locally.
- Update the toggle control implementation so the actual checkbox remains clickable and label semantics stay intact.
- Re-run the targeted e2e tests plus lint and format verification before committing.
- Commit all current branch changes together and push the existing branch.

## Affected Areas

- `apps/ui/src/components/ui/Toggle.tsx`
- viewer settings surfaces that use the shared toggle control
- rendering e2e tests and any nearby support code if verification uncovers related issues

## Checklist

- [x] Create plan file
- [x] Reproduce failing e2e tests locally
- [x] Fix toggle interaction issue
- [x] Re-run lint, format, and targeted e2e verification
- [ ] Commit current branch changes
- [ ] Push branch
