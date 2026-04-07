# Viewer Self-Shadow Artifact

## Goal

Root-cause and fix the phantom shadow shape that appears on 3D preview meshes even when no visible geometry matches that silhouette.

## Approach

- Confirm the relevant preview mesh and lighting pipeline used by both the interactive 3D viewer and offscreen captures.
- Remove the self-shadowing behavior that lets thin solids project hidden faces onto their own visible surfaces while preserving overall scene lighting and ground contact shadows.
- Add regression coverage around the shared preview mesh builder so the viewer does not reintroduce mesh self-shadow artifacts.
- Run targeted tests and the shared validation helper for the changed frontend files.

## Affected Areas

- `apps/ui/src/services/preview3dModel.ts`
- `apps/ui/src/services/__tests__/preview3dModel.test.ts`
- `implementation-plans/viewer-self-shadow-artifact.md`

## Checklist

- [x] Inspect the 3D preview lighting and mesh construction path to identify the artifact source.
- [x] Update the shared preview mesh configuration to prevent phantom self-shadowing.
- [x] Add or update regression tests for the preview mesh builder behavior.
- [x] Run targeted tests and validation for the changed files.
- [x] Prepare branch, commit, and draft PR handoff against `main`.
