# CI Lint and Format Cleanup

## Goal

Bring the current branch to a passing state for CI formatting and lint checks, then commit all current workspace changes and push the branch.

## Approach

- Run the same formatting and lint commands used by CI to capture the current failures.
- Apply the smallest safe code and formatting changes needed to make the branch pass.
- Re-run checks to verify the result before committing.
- Commit all current workspace changes together and push the existing branch.

## Affected Areas

- GitHub Actions workflow definitions
- UI TypeScript and React files
- Shared package metadata if lockfiles or scripts need normalization
- Any newly added analytics or settings files participating in lint/format checks

## Checklist

- [x] Create plan file
- [x] Run CI formatting and lint checks
- [x] Fix formatting issues
- [x] Fix lint issues
- [x] Re-run verification
- [ ] Commit current branch changes
- [ ] Push branch
