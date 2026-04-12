# Desktop Empty Folder Open

## Goal

Allow the desktop app to open a folder that contains no `.scad` files by creating `main.scad`, selecting it as the render target, and hydrating the workspace instead of surfacing an error.

## Approach

- Reuse the existing `loadWorkspaceFolder(..., { createIfEmpty: true })` path that already writes the default `main.scad` file.
- Change the desktop workspace-open service to default to `createIfEmpty` when the platform has filesystem access, while still honoring explicit `false` for callers that want strict behavior.
- Add regression coverage for both the new default desktop behavior and the explicit opt-out path.

## Affected Areas

- `apps/ui/src/services/windowOpenService.ts`
- `apps/ui/src/services/__tests__/windowOpenService.test.ts`

## Checklist

- [x] Read required repo guidance and inspect the current folder-open flow.
- [x] Implement the desktop empty-folder open fallback in the shared window-open service.
- [x] Add regression tests for default creation and explicit opt-out behavior.
- [x] Run deterministic validation for the changed files.
- [x] Review the final diff, commit, push, and open a draft PR against `main`.

## Validation Notes

- `pnpm install --frozen-lockfile`
- `bash scripts/validate-changes.sh --dry-run --changed-file apps/ui/src/services/windowOpenService.ts --changed-file apps/ui/src/services/__tests__/windowOpenService.test.ts --changed-file implementation-plans/desktop-empty-folder-open.md`
- `bash scripts/validate-changes.sh --changed-file apps/ui/src/services/windowOpenService.ts --changed-file apps/ui/src/services/__tests__/windowOpenService.test.ts --changed-file implementation-plans/desktop-empty-folder-open.md`
- Draft PR: `https://github.com/zacharyfmarion/openscad-studio/pull/116`
- Preview URL: `https://pr-116.openscad-studio.pages.dev/`
