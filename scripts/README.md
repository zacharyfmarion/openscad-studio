# Release Scripts

This directory contains scripts to help with the release process.

## `release.sh`

`release.sh` now uses a protected-branch-friendly two-step flow.

### Prerequisites

Before running the release script, ensure you have:

1. **GitHub CLI (`gh`)** installed and authenticated:
   ```bash
   brew install gh
   gh auth login
   ```
2. **`jq`** for JSON processing:
   ```bash
   brew install jq
   ```
3. **`pnpm`** for package management:
   ```bash
   npm install -g pnpm
   ```
4. **Rust toolchain** available so `Cargo.lock` can be refreshed:
   ```bash
   rustc --version
   cargo --version
   ```
5. **Clean working directory** with no uncommitted or untracked files.

### Usage

Prepare the release PR:

```bash
./scripts/release.sh prepare 0.10.0
```

After that PR is merged to `main`, publish the release:

```bash
./scripts/release.sh publish 0.10.0
```

For AI or other automation, `prepare` also supports non-interactive changelog input:

```bash
./scripts/release.sh prepare 0.10.0 --notes-file /tmp/release-notes.md --yes
./scripts/release.sh prepare 0.10.0 --notes "### Added\n- Example" --yes
cat /tmp/release-notes.md | ./scripts/release.sh prepare 0.10.0 --notes-stdin --yes
```

### `prepare`

The `prepare` command will:

1. Verify required tools and repository state.
2. Fetch `origin/main`.
3. Create `release/vX.Y.Z` from `origin/main`.
4. Prompt for release notes.
   Automation can provide release notes with `--notes-file`, `--notes`, or `--notes-stdin`.
5. Update:
   - `package.json`
   - `apps/ui/package.json`
   - `apps/ui/src-tauri/Cargo.toml`
   - `apps/ui/src-tauri/Cargo.lock`
   - `apps/ui/src-tauri/tauri.conf.json`
   - `apps/ui/src/constants/appInfo.ts`
   - `CHANGELOG.md`
6. Commit the bump as `chore: prepare release vX.Y.Z`.
7. Push the release branch to `origin`.
8. Open a PR to `main` with `gh pr create`.

### `publish`

The `publish` command will:

1. Fetch `origin/main` and tags.
2. Find the merged PR for `release/vX.Y.Z`.
3. Resolve the PR merge commit.
4. Verify that merged commit is reachable from `origin/main`.
5. Verify the tagged commit contains matching release versions in all tracked version files.
6. Verify `CHANGELOG.md` contains a non-empty `X.Y.Z` entry.
7. Create and push only the annotated tag `vX.Y.Z`.

Pushing that tag triggers GitHub Actions to:

1. Validate the tagged commit.
2. Build and notarize macOS DMGs.
3. Create the GitHub Release using the matching `CHANGELOG.md` entry as the body.
4. Update the Homebrew cask automatically.

### Example Release Notes Format

When prompted for release notes, you can use Markdown:

```markdown
### Added

- Model selector in AI chat for switching models mid-conversation
- Active tab indicator with colored accent

### Changed

- Improved model routing logic
- Redesigned settings dialog

### Fixed

- Fixed tab close button with drag-to-reorder
- Fixed model selection API routing issue
```

### Post-Release Checklist

After `publish` completes and the workflow finishes:

1. Verify the GitHub Release page.
2. Download and test the DMG artifacts.
3. Confirm the release notes match the `CHANGELOG.md` entry.
4. Confirm the Homebrew cask update landed successfully.

### Troubleshooting

**"`gh` is required"**

- Install with `brew install gh`
- Authenticate with `gh auth login`

**"You have uncommitted or untracked changes"**

- Commit, stash, or clean the working tree before running `prepare` or `publish`

**"Expected exactly one merged PR"**

- Make sure the `release/vX.Y.Z` PR exists and has been merged to `main`

**"Tagged commit version mismatch"**

- Verify the merged release PR updated all tracked version sources before running `publish`

### Manual Fallback

If you need to recover manually:

1. Create a release branch from `main`
2. Update the release version files and `CHANGELOG.md`
3. Open and merge the release PR
4. Create the annotated tag on the merged release commit:
   ```bash
   git tag -a vX.Y.Z <merge-commit-sha> -m "Release vX.Y.Z"
   git push origin refs/tags/vX.Y.Z
   ```
