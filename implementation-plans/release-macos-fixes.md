# Release MacOS Workflow Fixes

## Goal

Stabilize the macOS release pipeline after the failed `v1.0.0` release by fixing runner selection, improving signing/notarization diagnostics, and adding a manual smoke-test path that can validate the release workflow before cutting `1.0.1`.

## Approach

- Update the release workflow to support both tag-driven publishing and manual smoke-test runs.
- Pin explicit GitHub-hosted macOS runner labels per target architecture.
- Add a CI-only signing helper that re-signs the bundled `OpenSCAD.app` resource before the Tauri build.
- Add verification and better notarization logging so Apple rejection details are visible in the workflow output.

## Affected Areas

- `.github/workflows/release.yml`
- `apps/ui/src-tauri/scripts/`

## Checklist

- [x] Create implementation plan record.
- [x] Add explicit per-arch macOS runners and workflow-dispatch smoke mode to the release workflow.
- [x] Add a helper to re-sign and verify the bundled `OpenSCAD.app` resource in CI.
- [x] Add post-build signing verification and richer notarization diagnostics.
- [x] Run targeted validation and record results.

## Validation Notes

- `bash scripts/validate-changes.sh --dry-run --changed-file .github/workflows/release.yml --changed-file apps/ui/src-tauri/scripts/resign-bundled-openscad.sh`
- `bash scripts/validate-changes.sh --changed-file .github/workflows/release.yml --changed-file apps/ui/src-tauri/scripts/resign-bundled-openscad.sh`
- `gh workflow run Release --ref codex/release-macos-fixes`
- Smoke run `23918954126` exposed that the packaged nested `OpenSCAD.app` became signature-invalid after Tauri bundled the `.app`; the workflow was then updated to build the `.app` first, re-sign the packaged nested app, and only then bundle the DMG.
- `bash scripts/validate-changes.sh --changed-file .github/workflows/release.yml --changed-file apps/ui/src-tauri/scripts/resign-bundled-openscad.sh` (post-smoke iteration)
- Smoke run `23919504410` exposed that Tauri's resource copy flattened Qt framework symlinks inside the packaged nested `OpenSCAD.app`; the workflow now replaces that copied app with a symlink-preserving `ditto` copy before re-signing and DMG bundling.
- `rm -rf 'apps/ui/src-tauri/target/release/bundle/macos/OpenSCAD Studio.app/Contents/Resources/OpenSCAD.app' && ditto 'apps/ui/src-tauri/binaries/OpenSCAD.app' 'apps/ui/src-tauri/target/release/bundle/macos/OpenSCAD Studio.app/Contents/Resources/OpenSCAD.app'`
- `APPLE_SIGNING_IDENTITY='-' bash apps/ui/src-tauri/scripts/resign-bundled-openscad.sh 'apps/ui/src-tauri/target/release/bundle/macos/OpenSCAD Studio.app/Contents/Resources/OpenSCAD.app'`
- Smoke run `23919984429` confirmed the symlink-preserving copy fixed the packaged nested app, then exposed that `tauri bundle --bundles dmg` cleans the intermediate `bundle/macos/OpenSCAD Studio.app` path before the final verification step runs; the workflow now verifies the app bundles before DMG creation and the DMG afterward.
- Smoke run `23920395926` confirmed the app-bundle path is fixed and exposed that the generated DMG is unsigned; the workflow now explicitly signs the DMG before verification and notarization.
- `bash -n apps/ui/src-tauri/scripts/resign-bundled-openscad.sh`
- `ruby -e 'require "yaml"; YAML.load_file(".github/workflows/release.yml"); puts "yaml-ok"'`
- `pnpm exec prettier --check .github/workflows/release.yml implementation-plans/release-macos-fixes.md`
- `git diff --check`

GitHub-side smoke validation was not run from this session because the new workflow path requires pushing the branch and dispatching the workflow remotely.
