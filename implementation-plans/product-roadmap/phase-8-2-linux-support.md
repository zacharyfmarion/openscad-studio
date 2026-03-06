# Phase 8.2: Linux Support

## Summary

Ship Linux support by making OpenSCAD path detection robust across distros/packaging, producing AppImage + deb + rpm from Tauri bundling, with QA focused on portals/file dialogs across GNOME/KDE/XFCE and Wayland/X11.

## Effort Estimate

Large (3d+) — detection+UX 0.5–1d, packaging 1–2d, CI 0.5–1d, DE/Wayland QA + fixes 1–2d

## Action Plan

1. **Confirm Linux runtime baseline** (Tauri/Wry/WebKitGTK) and document required system libs for Ubuntu 22.04 and Fedora 39.
2. **Implement Linux-aware OpenSCAD detection**: saved user path → PATH → common absolute paths → Snap/Flatpak probe; always validate by running `openscad --version`.
3. **Package outputs**: AppImage first, then deb + rpm; defer Flatpak/Snap unless required.
4. **Configure Tauri bundler** for Linux metadata + desktop entry + icons.
5. **Harden desktop experience**: file dialogs (portals), theming, Wayland/X11 parity.
6. **CI/CD**: add Linux build jobs producing AppImage/deb/rpm artifacts.
7. **QA matrix + distribution**: Ubuntu 22.04/24.04, Fedora 39/40, Arch sanity check; GitHub Releases.

## OpenSCAD Detection

Detection order:

1. Saved user path → validate by running `openscad --version`
2. `$PATH` lookup
3. Common absolute paths: `/usr/bin/openscad`, `/usr/local/bin/openscad`, `/snap/bin/openscad`
4. Optionally probe Flatpak (`flatpak info org.openscad.OpenSCAD`) and guide user

## System Dependencies

- **Ubuntu/Debian**: `libwebkit2gtk-*`, `libjavascriptcoregtk-*`, `libgtk-3-0`, `libglib2.0-0`, `libssl*`, plus tray/appindicator deps
- **Fedora**: `webkit2gtk*`, `gtk3`, `openssl-libs`

## Package Formats

- **AppImage**: best "single download" story; validate FUSE expectations
- **.deb/.rpm**: best for system integration; more dependency friction but cleaner installs
- **Flatpak**: strong portal integration but sandbox constraints break "find host OpenSCAD"
- **Snap**: similar sandbox issues; "classic confinement" often required

## Tauri Bundler Config

- Enable Linux targets: `appimage`, `deb`, `rpm`
- `.desktop` metadata: Name, Exec, Icon, Categories, StartupWMClass
- Icon sizes: 32/128/256/512 + SVG
- All write locations use XDG dirs (`$XDG_CONFIG_HOME`, `$XDG_DATA_HOME`, `$XDG_CACHE_HOME`)

## Desktop Environment Testing

- Explicitly test dialogs on GNOME, KDE, XFCE
- Verify open/save, folder picker, multi-select
- Wayland: portals are reliable path; ensure `xdg-desktop-portal` used when present
- Theme integration: confirm dark/light consistency (WebView + GTK theme)

## Wayland vs X11

- On Wayland, portals are often the reliable path for dialogs
- Track issues: focus, z-order, modal behavior
- Verify Monaco font/colors remain legible under common themes

## CI/CD

- Ubuntu runner job: install build deps, build, upload AppImage/deb/rpm
- Fedora container job for `.rpm` if needed
- Smoke step: validate bundle outputs exist and metadata present

## Testing Matrix

- Ubuntu 22.04 + 24.04
- Fedora 39 + 40
- Arch Linux (rolling distro sanity check)

## File Permissions

- Verify file access only through user-selected paths
- Document config/log locations
- Don't assume write access outside XDG dirs

## Auto-Update

- AppImage: in-app updater semantics
- deb/rpm: defer to system package manager (or later, a repo)

## Distribution

- Start with GitHub Releases (AppImage + deb + rpm)
- Add AUR and Flathub only once confident in sandbox/portal requirements

## Error Handling

- Missing system libraries: actionable installation instructions
- Display server issues: Wayland/X11/portal hints rather than crash

## Edge Cases

- **Flatpak build target**: plan for "OpenSCAD as bundled sidecar" or portal-mediated workflow
- **WSL2**: GUI depends on WSLg; treat as "best effort" with explanatory errors
- **Snap confinement**: strict confinement may prevent launching arbitrary binaries
