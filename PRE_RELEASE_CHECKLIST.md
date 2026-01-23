# Pre-Release Checklist for OpenSCAD Studio

This checklist covers everything needed before open sourcing the project.

## ✅ Completed

### Documentation
- [x] README.md updated with icon, badges, and comprehensive features list
- [x] LICENSE file created (MIT License)
- [x] CLAUDE.md created (AI assistant/contributor guide)
- [x] AGENTS.md created (AI agent architecture documentation)
- [x] ROADMAP.md exists with detailed phases
- [x] Project includes icon (images/icon.png) and Tauri app icons

### Build Verification
- [x] Production build tested and succeeds
- [x] DMG bundle created successfully (4.8MB)
- [x] All dependencies properly declared in package.json
- [x] Missing dependency (react-icons) added
- [x] TypeScript compilation passes

### Code Quality
- [x] All React components use modern patterns (hooks, functional components)
- [x] Rust code follows rustfmt conventions
- [x] No obvious security issues (API keys in keychain, not hardcoded)
- [x] Sidecar architecture properly isolates API keys
- [x] Git history is clean (no sensitive data in commits)

## ⚠️ Recommended Before Release

### Security Review
- [ ] **Review all commits** for accidentally committed API keys or secrets
  ```bash
  git log --all --full-history -- .env
  git log --all --full-history --grep="API_KEY"
  ```
- [ ] **Verify .gitignore** covers all sensitive files
  - [x] `.env` and `.env.local` ignored
  - [ ] Check no `.env` files in git history
- [ ] **API key storage**: Verify keychain integration works on all platforms
  - [x] macOS (using Keychain)
  - [ ] Test on Windows (Credential Manager)
  - [ ] Test on Linux (Secret Service)

### GitHub Repository Setup
- [x] Create GitHub repository (public)
- [x] Add repository description
- [x] Add topics/tags for discoverability
- [x] Documentation website with marketing materials
- [ ] Set up branch protection for `main` (optional)
- [ ] Configure GitHub Actions (optional)
  - [ ] Build verification on PR
  - [ ] Automated releases
  - [ ] Code coverage reporting

### Issue Templates
- [ ] Create bug report template (`.github/ISSUE_TEMPLATE/bug_report.md`)
- [ ] Create feature request template (`.github/ISSUE_TEMPLATE/feature_request.md`)
- [ ] Create pull request template (`.github/pull_request_template.md`)

### Contributing Guidelines
- [x] Create CONTRIBUTING.md with:
  - [x] Development setup instructions
  - [x] Code style guidelines
  - [x] Commit message conventions
  - [x] PR submission process
  - [x] Code of conduct reference

### Testing
- [x] Manual smoke test checklist (macOS):
  - [x] App launches successfully
  - [x] Monaco editor works (syntax highlighting, editing)
  - [x] OpenSCAD auto-detection works
  - [x] Live preview renders (PNG mode)
  - [x] 3D mesh viewer loads STL files
  - [x] 2D SVG mode works
  - [x] Export to STL/OBJ/etc. works
  - [x] File open/save works
  - [x] Multi-tab management works
  - [x] Settings dialog saves preferences
  - [x] Theme switching works
  - [x] AI copilot can be configured (with test API key)
  - [x] AI tools work (get_current_code, apply_edit, etc.)
  - [x] Diagnostics panel shows errors correctly
  - [x] Keyboard shortcuts work (⌘K, ⌘T, ⌘W, etc.)
  - [x] Recent files list works
  - [x] Code formatting works (⌘Shift+F)
  - [x] Autocomplete works
  - [x] Multi-file imports work (use/include)

### Platform Testing
- [x] Test on macOS (Apple Silicon) - primary development platform
- [ ] Test on macOS (Intel) - needs verification
- [ ] Test on Windows 10/11 - not yet tested
- [ ] Test on Linux (Ubuntu/Fedora) - not yet tested
- [ ] Verify OpenSCAD detection on all platforms

### Known Issues Documentation
- [x] Document known limitations in README:
  - [x] Special operators (`#`, `%`, `*`, `!`) not visually distinguished
  - [x] No customizer panel for OpenSCAD parameters yet
  - [x] Preview resolution is fixed at 800x600 (not yet configurable)
  - [x] AI features require API key (no offline mode yet)
  - [x] Only tested on macOS (Windows/Linux pending)

### Dependencies Audit
- [ ] Run `pnpm audit` and address critical vulnerabilities
- [ ] Review all dependencies for licensing compatibility
- [ ] Document any GPL dependencies (currently none, OpenSCAD is invoked as subprocess)

### Build Artifacts
- [ ] Clean up any development artifacts:
  ```bash
  rm -rf node_modules/
  rm -rf apps/*/node_modules/
  rm -rf target/
  rm -rf apps/ui/src-tauri/target/
  rm -rf apps/sidecar/dist/
  ```
- [ ] Verify fresh build works:
  ```bash
  pnpm install
  pnpm build
  ```

### Marketing/Community
- [ ] Prepare announcement blog post or tweet
- [ ] Prepare screenshots/GIFs for README (optional)
- [ ] Consider demo video (optional)
- [ ] Prepare to post on:
  - [ ] Hacker News
  - [ ] Reddit (r/openscad, r/rust)
  - [ ] OpenSCAD forums/Discord
  - [ ] Dev.to / Hashnode

## 🚀 Release Process (Fully Automated)

### One-Time Setup (Required First Time Only)
1. Create GitHub Personal Access Token (PAT) with repo scope for `homebrew-openscad-studio`
2. Add `HOMEBREW_TAP_TOKEN` secret to the openscad-studio repository
3. Create the `zacharyfmarion/homebrew-openscad-studio` repository with initial cask formula

### Release a New Version
```bash
# Run from project root - this does EVERYTHING
./scripts/release.sh 0.5.0
```

The script will:
1. Bump version numbers in all files
2. Update CHANGELOG.md
3. Commit and push tag

GitHub Actions will then automatically:
1. Build macOS DMGs (ARM + Intel)
2. Create a published GitHub Release with artifacts
3. Update the Homebrew cask formula with new version and SHA256 hashes

**No manual steps required after running the release script.**

### Post-Release Verification
- [ ] Monitor GitHub Actions workflow completion
- [ ] Verify release appears on GitHub Releases page
- [ ] Test installation: `brew tap zacharyfmarion/openscad-studio && brew install --cask openscad-studio`
- [ ] Monitor GitHub issues for bug reports

### Troubleshooting
If the Homebrew cask update fails:
1. Check if `HOMEBREW_TAP_TOKEN` secret is set correctly
2. Check GitHub Actions logs for specific error
3. Manually update the cask formula if needed

## 📝 Optional Enhancements (Not Blocking)

### Screenshots & Media
- [ ] Add screenshots to README
- [ ] Create animated GIF of workflow
- [ ] Record demo video

### CI/CD
- [ ] Set up GitHub Actions for automated builds
- [ ] Configure dependabot for security updates
- [ ] Set up automated changelog generation

### Documentation Site
- [ ] Set up GitHub Pages or docs site
- [ ] Add tutorials and guides
- [ ] Create API documentation

### Community
- [ ] Set up Discord server
- [ ] Create discussions board on GitHub
- [ ] Add sponsor/funding links (optional)

## 🔒 Security Considerations

### Sensitive Data Check
Run these commands to ensure no secrets in git history:
```bash
# Check for common secret patterns
git log --all -S"sk-" --source --all  # OpenAI keys
git log --all -S"sk-ant-" --source --all  # Anthropic keys
git log --all -S"password" --source --all
git log --all -S"secret" --source --all

# Check .env files
git log --all --full-history -- "**/.env"
git log --all --full-history -- "**/.env.local"
```

### API Key Handling
- [x] API keys stored in OS keychain (not localStorage, not .env)
- [x] Sidecar process receives keys via environment variables
- [x] Keys never exposed to renderer process
- [x] Example .env.example file exists (no real keys)

## 📋 Final Verification Before "Publish" Button

- [ ] All TODOs in code removed or documented in issues
- [ ] No debug console.log statements in production code
- [ ] All tests pass (when implemented)
- [ ] Fresh clone builds successfully
- [ ] LICENSE year is correct (2025)
- [ ] Contact information is correct (GitHub username, etc.)
- [ ] README badges/links work correctly

---

**Last Updated**: 2025-10-13

Once all critical items are checked, you're ready to make the repository public! 🎉
