# Release Scripts

This directory contains scripts to help with the release process.

## release.sh

Comprehensive release automation script that handles the entire release process.

### Prerequisites

Before running the release script, ensure you have:

1. **GitHub CLI (`gh`)** installed and authenticated:
   ```bash
   brew install gh
   gh auth login
   ```

2. **jq** for JSON processing:
   ```bash
   brew install jq
   ```

3. **pnpm** for package management:
   ```bash
   npm install -g pnpm
   ```

4. **Clean working directory**: Commit or stash all changes before running

5. **Main branch**: It's recommended to run from the `main` branch

### Usage

```bash
./scripts/release.sh
```

The script will:

1. **Check prerequisites**: Verify required tools and repository state
2. **Version input**: Prompt for the new version number (e.g., `0.2.0`)
3. **Release notes**: Prompt for release notes (supports multi-line, press Ctrl+D when done)
4. **Update versions**: Automatically update:
   - `package.json`
   - `apps/ui/package.json`
   - `apps/ui/src-tauri/Cargo.toml`
   - `apps/ui/src-tauri/Cargo.lock`
5. **Update CHANGELOG.md**: Add new version entry with date and release notes
6. **Commit and tag**: Create a commit for the version bump and tag it
7. **Build**: Run production build (`pnpm tauri build`)
8. **Create GitHub release**: Use GitHub CLI to create a release with:
   - Release notes
   - Git tag
   - Build artifacts (DMG, AppImage, MSI, etc. based on platform)

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

### What Gets Uploaded

The script automatically detects and uploads platform-specific artifacts:

- **macOS**: `.dmg` and `.app.tar.gz` files
- **Linux**: `.AppImage` and `.deb` files
- **Windows**: `.msi` and `.exe` files

### Post-Release Checklist

After the script completes:

1. ✅ Verify the GitHub release page
2. ✅ Download and test the artifacts
3. ✅ Check CHANGELOG.md was updated correctly
4. ✅ Announce the release (social media, blog, etc.)

### Troubleshooting

**"GitHub CLI (gh) is required"**
- Install with: `brew install gh`
- Authenticate with: `gh auth login`

**"Build failed"**
- Check that all dependencies are installed
- Run `pnpm install` to ensure packages are up to date
- Check Rust toolchain is installed: `rustc --version`

**"No build artifacts found"**
- The script continues but skips artifact upload
- Artifacts may be in a non-standard location
- Check `apps/ui/src-tauri/target/release/bundle/`

### Manual Release (if script fails)

If the automated script fails, you can manually:

1. Update version numbers in `package.json` and `Cargo.toml`
2. Update `CHANGELOG.md`
3. Commit: `git commit -m "chore: bump version to X.Y.Z"`
4. Tag: `git tag -a vX.Y.Z -m "Release vX.Y.Z"`
5. Push: `git push origin main --tags`
6. Build: `pnpm tauri build`
7. Create release on GitHub UI and upload artifacts manually
