# New Badge Share Button

## Goal

Add a reusable UI component for "new" badge annotations and use it on the header share button so the treatment can be reused elsewhere.

## Approach

- [x] Capture the implementation plan before code changes.
- [x] Review the current header button and UI primitive patterns.
- [x] Add a reusable badge component that fits the existing theme variables and compact control styling.
- [x] Attach the badge to the header share button without changing its click target or disabled behavior.
- [x] Add focused frontend tests for the new badge rendering.
- [x] Run formatting and validation for the changed frontend files.

## Affected Areas

- `apps/ui/src/App.tsx`
- `apps/ui/src/components/ui/AnnotationBadge.tsx`
- `apps/ui/src/components/ui/index.ts`
- `apps/ui/src/components/__tests__/AnnotationBadge.test.tsx`

## Checklist

- [x] Read the required repo guidance and inspect the target UI
- [x] Implement the reusable badge component
- [x] Wire the badge into the header share button
- [x] Add or update focused tests
- [x] Run validation and capture results
