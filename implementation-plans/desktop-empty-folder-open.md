# Empty Folder Open

## Goal

Allow both desktop folder opens and web folder imports to succeed when the chosen folder contains no `.scad` files by creating `main.scad`, selecting it as the render target, and hydrating the workspace instead of surfacing an error or doing nothing.

## Approach

- Reuse the existing `loadWorkspaceFolder(..., { createIfEmpty: true })` path that already writes the default `main.scad` file.
- Change the desktop workspace-open service to default to `createIfEmpty` when the platform has filesystem access, while still honoring explicit `false` for callers that want strict behavior.
- Add a small shared folder-import resolver for the web `webkitdirectory` path so empty folder selections fall back to the same default `main.scad` starter file in memory.
- Add regression coverage for the desktop behavior, the explicit opt-out path, and the web folder-import resolver.

## Affected Areas

- `apps/ui/src/services/windowOpenService.ts`
- `apps/ui/src/services/__tests__/windowOpenService.test.ts`
- `apps/ui/src/App.tsx`
- `apps/ui/src/utils/folderImport.ts`
- `apps/ui/src/utils/__tests__/folderImport.test.ts`

## Checklist

- [x] Read required repo guidance and inspect the current folder-open flow.
- [x] Implement the desktop empty-folder open fallback in the shared window-open service.
- [x] Add regression tests for default creation and explicit opt-out behavior.
- [x] Extend the web folder-import flow to create `main.scad` for empty folder selections.
- [x] Run deterministic validation for the changed files.
- [x] Review the final diff, commit, push, and open a draft PR against `main`.

## Validation Notes

- `pnpm install --frozen-lockfile`
- `bash scripts/validate-changes.sh --dry-run --changed-file apps/ui/src/services/windowOpenService.ts --changed-file apps/ui/src/services/__tests__/windowOpenService.test.ts --changed-file implementation-plans/desktop-empty-folder-open.md`
- `bash scripts/validate-changes.sh --changed-file apps/ui/src/services/windowOpenService.ts --changed-file apps/ui/src/services/__tests__/windowOpenService.test.ts --changed-file implementation-plans/desktop-empty-folder-open.md`
- `bash scripts/validate-changes.sh --dry-run --changed-file apps/ui/src/App.tsx --changed-file apps/ui/src/utils/folderImport.ts --changed-file apps/ui/src/utils/__tests__/folderImport.test.ts --changed-file implementation-plans/desktop-empty-folder-open.md`
- `pnpm prettier --write apps/ui/src/App.tsx`
- `bash scripts/validate-changes.sh --changed-file apps/ui/src/App.tsx --changed-file apps/ui/src/utils/folderImport.ts --changed-file apps/ui/src/utils/__tests__/folderImport.test.ts --changed-file implementation-plans/desktop-empty-folder-open.md`
- Draft PR: `https://github.com/zacharyfmarion/openscad-studio/pull/116`
- Preview URL: `https://pr-116.openscad-studio.pages.dev/`
