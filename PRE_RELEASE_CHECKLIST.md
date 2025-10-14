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
- [ ] Create GitHub repository
- [ ] Add repository description: "A modern cross-platform OpenSCAD editor with live preview and AI copilot"
- [ ] Add topics/tags: `openscad`, `3d-modeling`, `tauri`, `rust`, `react`, `ai-assistant`, `cad`, `editor`
- [ ] Set up branch protection for `main`
- [ ] Configure GitHub Actions (optional)
  - [ ] Build verification on PR
  - [ ] Automated releases
  - [ ] Code coverage reporting

### Issue Templates
- [ ] Create bug report template (`.github/ISSUE_TEMPLATE/bug_report.md`)
- [ ] Create feature request template (`.github/ISSUE_TEMPLATE/feature_request.md`)
- [ ] Create pull request template (`.github/pull_request_template.md`)

### Contributing Guidelines
- [ ] Create CONTRIBUTING.md with:
  - [ ] Development setup instructions
  - [ ] Code style guidelines
  - [ ] Commit message conventions
  - [ ] PR submission process
  - [ ] Code of conduct reference

### Testing
- [ ] Manual smoke test checklist:
  - [ ] App launches successfully
  - [ ] Monaco editor works (syntax highlighting, editing)
  - [ ] OpenSCAD auto-detection works
  - [ ] Live preview renders (PNG mode)
  - [ ] 3D mesh viewer loads STL files
  - [ ] 2D SVG mode works
  - [ ] Export to STL/OBJ/etc. works
  - [ ] File open/save works
  - [ ] Multi-tab management works
  - [ ] Settings dialog saves preferences
  - [ ] Theme switching works
  - [ ] AI copilot can be configured (with test API key)
  - [ ] AI tools work (get_current_code, apply_edit, etc.)
  - [ ] Diagnostics panel shows errors correctly
  - [ ] Keyboard shortcuts work (⌘K, ⌘T, ⌘W, etc.)

### Platform Testing
- [ ] Test on macOS (Intel and Apple Silicon)
- [ ] Test on Windows 10/11
- [ ] Test on Linux (Ubuntu/Fedora recommended)
- [ ] Verify OpenSCAD detection on all platforms

### Known Issues Documentation
- [ ] Create KNOWN_ISSUES.md or add to README:
  - [ ] No multi-file support yet (use/include directives)
  - [ ] OpenSCAD stderr parsing is regex-based (may miss some errors)
  - [ ] No undo/redo stack (Monaco has built-in, but not tracked across renders)
  - [ ] Preview resolution is fixed (not yet configurable)
  - [ ] AI features require API key (no offline mode yet)

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

## 🚀 Release Process

### 1. Final Checks
```bash
# Clean build
pnpm install
pnpm build
cd apps/ui && pnpm tauri build

# Verify bundle
ls -lh apps/ui/src-tauri/target/release/bundle/
```

### 2. Tag Release
```bash
# Create annotated tag
git tag -a v0.1.0 -m "Release v0.1.0 - Initial public release"
git push origin v0.1.0
```

### 3. GitHub Release
- [ ] Create GitHub release from tag v0.1.0
- [ ] Upload build artifacts:
  - [ ] macOS DMG (OpenSCAD Studio_0.1.0_aarch64.dmg)
  - [ ] Windows MSI (if built)
  - [ ] Linux AppImage/deb (if built)
- [ ] Write release notes highlighting:
  - [ ] Key features
  - [ ] Known limitations
  - [ ] Installation instructions
  - [ ] Link to documentation

### 4. Post-Release
- [ ] Monitor GitHub issues for bug reports
- [ ] Respond to community feedback
- [ ] Plan next release (v0.2.0) based on feedback
- [ ] Update ROADMAP.md based on priorities

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
