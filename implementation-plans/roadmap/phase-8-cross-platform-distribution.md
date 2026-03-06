# Phase 8 — Cross-Platform & Distribution Implementation Plan

## Overview

Ship Windows + Linux desktop builds by eliminating OS assumptions (paths, shortcuts, OpenSCAD detection), then add CI-built signed installers, Tauri's updater wired to GitHub Releases, and a minimal-but-reliable desktop E2E suite.

**Effort estimate:** Large (~2–4 weeks depending on signing/notarization access and E2E stabilization)

---

# 8.1 Windows Support

## Path Handling

- Rust backend as "path authority": `path_join`, `path_normalize`, `path_is_absolute`
- Frontend: never build paths with `/` or `\\`; only display strings from dialogs/backend
- Storage format: persist as file URLs (`file:///C:/...`) or raw OS paths (standardize one)

## OpenSCAD Detection

1. Registry: `HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\openscad.exe`
2. Common paths: `C:\Program Files\OpenSCAD\openscad.exe`, `C:\Program Files (x86)\...`
3. PATH search: `where openscad`
4. User override in Settings

## Keyboard Shortcuts

- Define accelerators using logical actions with `CmdOrCtrl` in Tauri menus
- React/editor: `isPrimaryModifier(event)` helper (Meta on macOS, Ctrl on Win/Linux)
- Avoid hijacking `Alt` combos that conflict with system menus

## Platform-Specific UI

- Prefer native title bar on Windows initially
- Validate resize/maximize/minimize across DPI settings
- System tray: optional "Minimize to tray" setting

## Testing Matrix

- Windows 10 (22H2), Windows 11 (23H2+)
- DPI: 100%, 150%, 200%
- Single + multi-monitor

## Installer

- MSI via Tauri bundler
- Code signing with Windows certificate (EV preferred for SmartScreen)
- CI: import PFX from GitHub Secrets, run signtool with timestamping

## Known Issues

- WebView2: detect presence, show prompt if missing
- Fonts: validate monospace fallback; prefer system fonts

---

# 8.2 Linux Support

## Package Formats

- **AppImage** (primary "works everywhere")
- **.deb** (Ubuntu/Debian)
- **.rpm** (Fedora/RHEL)

## Desktop Environment Testing

- GNOME (Wayland + X11), KDE Plasma, XFCE
- Verify: window focus, shortcuts, menus, file dialogs, drag/drop, system tray

## File Dialog Compatibility

- Prefer portal-based dialogs (better Wayland support)
- Fallback if portal unavailable

## OpenSCAD Detection

1. `which openscad` / PATH search
2. Common: `/usr/bin/openscad`, `/usr/local/bin/openscad`
3. Flatpak: `flatpak run org.openscad.OpenSCAD`
4. Snap: `snap run openscad`
5. User override

## Dependencies

- Document required packages: webkit2gtk, gtk3, build toolchain
- Install in CI before `pnpm tauri:build`

## Testing Matrix

- Ubuntu 22.04 LTS, Fedora 39, Arch (best-effort)

---

# 8.3 Auto-Update

## Tauri Updater Plugin

- Enable plugin, configure endpoints + public key + check policy

## Update Server

- GitHub Releases as single source of truth
- Release job publishes installers + updater manifest + signatures

## Update Flow

- Startup (or daily): silent check
- If available: in-app banner with version + changelog
- Download with progress → install → restart (user-confirmed)

## UX

- Settings: current version, "Check for updates" button, optional auto-download toggle
- Changelog from GitHub release notes (render markdown)

## Rollback

- No automatic rollback; version settings schema with backup on migration
- "Download previous version" link to GitHub Releases
- Bad release: yank by publishing fix and updating "latest" manifest

## Edge Cases

- No internet: silent fail on background check; error on manual check
- Partial download: verify checksum/signature; restart download
- Active work: never auto-restart; warn about unsaved changes

---

# 8.4 CI/CD Pipeline

## GitHub Actions Workflows

- `ci.yml` (PR + main): lint, format, typecheck, unit tests, debug build, smoke E2E (Linux)
- `release.yml` (tag push): matrix build signed installers, generate updater artifacts, upload to GitHub Release

## Pipeline Steps

1. `pnpm install --frozen-lockfile`
2. Frontend: typecheck, lint, format check
3. Rust: `cargo fmt --check`, `cargo clippy`, `cargo test`
4. Build: `pnpm tauri:build`
5. Security: `cargo audit` + `pnpm audit` (informational)

## Caching

- pnpm store cache (keyed by lockfile hash)
- Rust: `~/.cargo/registry`, `~/.cargo/git`, `target/` (per OS, keyed to toolchain)

## Build Times

- Cold: 10–25 min; warm cache: 5–12 min
- Optimization: release job on tags only; separate checks vs bundle jobs

## Secrets Management

- macOS: Developer ID cert + notarization credentials
- Windows: PFX + password, timestamp URL
- Updater: private key for signing
- Stored in GitHub Actions secrets; release workflow restricted to protected branches

---

# 8.5 E2E Test Suite

## Framework: WebdriverIO + tauri-driver

- Most direct/official path for Tauri desktop WebView automation
- Playwright can still test web version separately

## Critical Path Tests

### Smoke (every PR)

1. Launch → window renders
2. Editor loads default document
3. Modify code → preview updates
4. Save → reopen → contents persist
5. Open recent → loads correctly
6. Settings open/close + persists toggle

### Release gating (nightly + pre-tag)

7. Keyboard shortcuts (save/open/undo/redo, platform-specific modifiers)
8. Path edge cases (spaces, Windows drive letters)
9. OpenSCAD detection ("not installed" doesn't break app)

## Test Architecture

- `e2e/fixtures/` (sample .scad files)
- `e2e/pages/` (Page Objects: EditorPage, SettingsPage, FileMenu)
- `e2e/helpers/` (waitForRenderComplete, platform utils)
- Stable selectors: `data-testid="editor"`, etc.

## CI Integration

- PR: smoke suite on Linux with xvfb
- Nightly: full suite on Linux + Windows
- Tag: full suite before publishing

## Flakiness Mitigation

- Event-driven waits (render complete, file saved toast) over sleeps
- 1–2 retries max with screenshot/log artifact capture
- Generous timeouts for first WASM render in CI

## What to Skip (Phase 8)

- OS-native file dialog automation
- Pixel-perfect rendering comparisons
- Auto-update E2E on every PR

---

# Combined Implementation Steps

1. **Cross-platform foundations** (path utilities, shortcut mapping, platformInfo helper)
2. **OpenSCAD detection API** (Rust, OS-specific strategies)
3. **Windows build + installer + signing** (compile, validate, MSI, code signing)
4. **Linux build + packaging** (AppImage + deb + rpm, validate across distros)
5. **CI (PR) pipeline** (checks + build + smoke E2E on Linux + caching)
6. **Release pipeline** (tag → matrix build → sign → upload to GitHub Releases)
7. **Auto-update** (Tauri updater + GitHub Releases + UX + safety behaviors)
8. **E2E suite expansion** (full critical path + nightly/release gating)
