# Protected-Branch Release Flow

## Goal

Split the release process into a PR-based prepare phase and a post-merge publish phase so branch protection on `main` is respected while keeping tag-driven GitHub Releases and the Homebrew cask update.

## Approach

- Refactor `scripts/release.sh` into `prepare` and `publish` subcommands.
- Make `prepare` create the version bump commit on `release/v<version>`, push it, and open a PR.
- Make `publish` locate the merged release PR, validate the merged commit, then create and push only the release tag.
- Update the release workflow to validate tagged commits, build stable latest-download assets, generate release notes from `CHANGELOG.md`, and keep the Homebrew cask update step.
- Update the web app to download from stable latest-release asset URLs so merged version-bump PRs do not create broken links before tagging.
- Refresh release documentation to describe the new flow.

## Affected Areas

- `scripts/release.sh`
- `.github/workflows/release.yml`
- `apps/ui/src/App.tsx`
- `apps/ui/src/constants/appInfo.ts`
- `scripts/README.md`

## Checklist

- [x] Add `prepare` and `publish` modes to the release script with branch/tag/PR validation.
- [x] Update all release-version sources during `prepare`, including `appInfo.ts` and `CHANGELOG.md`.
- [x] Validate tagged commits and changelog-derived release notes in the release workflow.
- [x] Upload stable DMG asset names for latest-release web downloads while preserving versioned assets for Homebrew.
- [x] Keep the Homebrew cask update step and fix it to target the actual Intel asset name.
- [x] Update release docs to reflect the protected-branch flow.
- [x] Run targeted verification for the script, workflow, and TypeScript changes.
