# Issue 99 H File Support

## Goal

Add comprehensive `.h` file support anywhere OpenSCAD Studio currently treats `.scad` files as the only valid project source files, including web imports, desktop folder loading and watching, AI project context, sharing, and automated coverage.

## Approach

1. Identify the shared and platform-specific file acceptance paths that currently filter to `.scad` only.
2. Introduce a shared OpenSCAD project file extension helper so web, desktop, and share flows stay aligned.
3. Update project loading, watching, and AI-facing behaviors to retain `.h` files while keeping render target selection on `.scad` entry files.
4. Add unit coverage for the new extension behavior and e2e coverage that proves an uploaded project using `.h` imports renders correctly.

## Affected Areas

- `apps/ui/src/App.tsx`
- `apps/ui/src/platform/tauriBridge.ts`
- `apps/ui/src/platform/webBridge.ts`
- `apps/ui/src/services/aiService.ts`
- `apps/ui/src/hooks/useAiAgent.ts`
- `apps/web/functions/api/share.ts`
- `apps/ui/src/...__tests__`
- `apps/web/functions/api/__tests__/share.test.ts`
- `e2e/tests/...`

## Checklist

- [x] Review the issue, repo guidance, and current `.scad`-only filters
- [x] Create this implementation plan
- [x] Add shared helpers/constants for supported OpenSCAD project file extensions
- [x] Update web and desktop project load/watch flows to keep `.h` files
- [x] Update AI/share handling so `.h` files remain visible and valid
- [x] Add or update unit coverage for the new behavior
- [x] Add or update e2e coverage for `.h` import rendering
- [x] Run deterministic validation for the touched areas
- [ ] Commit, open a draft PR against `main`, and wait for preview status
