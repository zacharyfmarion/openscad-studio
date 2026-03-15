# CI Format Fix for v0.10

## Goal

Bring the `codex/zac-v0.10` branch back to a green `Format` check by applying the exact Prettier changes CI expects.

## Approach

- Pull the failing `Format` job log from GitHub Actions.
- Reformat only the files CI reported.
- Re-run the same Prettier check command locally to confirm the branch matches CI.
- Commit and push the formatting-only follow-up to the existing PR branch.

## Affected Areas

- `apps/ui/src/App.tsx`
- `apps/ui/src/components/SvgViewer.tsx`
- `apps/ui/src/components/ThreeViewer.tsx`
- `apps/ui/src/components/__tests__/SvgViewer.test.tsx`
- `apps/ui/src/components/svg-viewer/geometrySnap.ts`
- `apps/ui/src/components/svg-viewer/measurementController.ts`
- `apps/ui/src/stores/workspaceFactories.ts`
- `apps/ui/src/stores/workspaceStore.ts`

## Checklist

- [x] Inspect the failing `Format` workflow output
- [x] Apply Prettier formatting to the reported files
- [x] Re-run the CI-equivalent Prettier check locally
- [ ] Commit the cleanup
- [ ] Push the branch update
