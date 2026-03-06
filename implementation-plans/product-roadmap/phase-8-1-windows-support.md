# Phase 8.1: Windows Support

## Summary

Ship Windows support by treating it as a first-class platform end-to-end: detection + path correctness + input shortcuts + packaging/signing + CI/testing.

## Effort Estimate

Large (3d+) for first Windows beta build; longer for production-grade signing reputation + auto-update parity.

## Action Plan

1. **Platform gating + abstractions:** Add Windows platform layer in Rust for OpenSCAD discovery and path normalization, and frontend "modifier key" abstraction for Ctrl on Windows.
2. **OpenSCAD detection:** Registry/App Paths → Uninstall registry entries → common install directories → PATH → user-provided override; record "how found" for debugging.
3. **Path handling:** Use `PathBuf` everywhere in Rust; add helpers for drive letters, UNC, `file://` URL conversion; unit tests for Windows path cases.
4. **Keyboard shortcuts + menus:** Standardize on `primaryModifier = Cmd|Ctrl`; define shortcuts once; verify display text and keybindings match on Windows.
5. **Windows filesystem:** Audit case-sensitive assumptions; handle long paths and OneDrive-synced directories; actionable error messages for UAC/permission issues.
6. **Installer + signing:** Configure Tauri MSI (WiX) with upgrade code, icons, install scope, Start Menu shortcuts; add Authenticode signing with timestamping.
7. **CI/CD + testing + distribution:** Add GitHub Actions Windows builds; run detection test suite + smoke flow; publish to GitHub Releases first, then optionally `winget`.

## OpenSCAD Detection (Windows)

Detection order:

1. `HKLM/HKCU\Software\Microsoft\Windows\CurrentVersion\App Paths\openscad.exe`
2. Uninstall keys (`…\Uninstall\*OpenSCAD*` incl. `Wow6432Node`)
3. `C:\Program Files\OpenSCAD\openscad.exe` / `Program Files (x86)` / `%LOCALAPPDATA%\Programs\OpenSCAD\`
4. PATH (`openscad.exe`)
5. Manual user override

## Path Handling

- Use `PathBuf` everywhere; only stringify at IPC boundary
- Accept both `\` and `/` from UI, normalize internally
- Preserve drive letter casing
- Support UNC (`\\server\share\...`)
- Safe `file://` URL conversion for Windows paths

## Keyboard Shortcuts

- Replace Cmd-hardcoded logic with `primaryModifier` (Cmd on macOS, Ctrl on Windows)
- Map across Monaco bindings + Tauri menu accelerators + tooltip/help text
- Verify actual keybindings match display text

## Filesystem Differences

- Case-insensitive path comparisons and caches
- Handle long paths (manifest `longPathAware`)
- Rename atomicity: don't assume across volumes

## Installer (MSI)

- Tauri v2 Windows bundler (WiX/MSI) config
- Product/upgrade codes, versioning, icons, install dir
- Start Menu shortcuts, ARP metadata
- Verify WebView2 prerequisite behavior

## Code Signing

- Acquire Authenticode cert (OV minimum; EV recommended for fewer SmartScreen prompts)
- Sign binaries/MSI via `signtool` with RFC3161 timestamp
- Store cert in CI via GitHub Secrets + secure PFX handling

## UI Adjustments

- No global menu bar on Windows; ensure commands accessible via window menu or in-app UI
- Verify window chrome/title bar under Windows themes and scaling

## Font Rendering

- Editor font stack: `Cascadia Mono`, `Consolas`, fallback `monospace`
- UI font stack: `Segoe UI`
- Verify Monaco ligatures/antialiasing at common DPIs

## CI/CD

- Add Windows runner build job
- Install WiX toolset/signing tooling
- Produce MSI artifacts
- Run Rust unit tests + smoke checks

## Testing Matrix

- Windows 10 + 11
- OpenSCAD stable versions (at least one older + latest)
- Default path and custom path with spaces

## Auto-Update

- Options: "in-app updater launches MSI and prompts reinstall" (beta) or defer until updater-friendly installer
- Document behavior in release notes

## Error Handling

- Normalize Windows failures: UAC, missing VC runtimes, "Access is denied", locked files
- Include remediation: "run as admin", "choose user-writable folder", "reinstall OpenSCAD"

## Edge Cases

- Spaces in install path: proper quoting in process spawning
- Non-ASCII usernames: avoid lossy string conversions; keep `OsStr/Path`
- OneDrive paths: can break naive canonicalize + compare logic

## Distribution

- Start with GitHub Releases + signed MSI
- Optionally add `winget` once MSI IDs/versioning stable
- Consider Chocolatey only if users request
