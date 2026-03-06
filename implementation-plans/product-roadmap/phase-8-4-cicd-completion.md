# Phase 8.4: CI/CD Completion — Windows/Linux Builds + Dependency Audit

## Summary

Update `release.yml` to a 3-OS build matrix (macOS/Windows/Linux) producing platform-native Tauri bundles into the same GitHub Release, and add dedicated security audit jobs (`pnpm audit` + `cargo audit`).

## Effort Estimate

Medium (1–2d) for CI builds + audits; Large (3d+) if including Windows Authenticode + macOS notarization fully in CI.

## Action Plan

1. **Restructure `release.yml`**: "create release" job → matrix "build & upload" job for macOS/Windows/Linux targeting same release.
2. **Add Windows + Linux runner provisioning**: OS-specific dependency install steps before Tauri build.
3. **Define artifact naming + collection rules**: `{app}-{version}-{os}-{arch}.{ext}`.
4. **Add cross-platform test matrix**: lint/typecheck/unit tests on all OS; Playwright E2E scoped per OS.
5. **Add dependency security audits**: `pnpm audit` (Node) + `cargo audit` (Rust) as separate jobs.
6. **Add caching + build-time optimizations**: pnpm store + Rust target/registry cache per OS.
7. **Harden error handling**: build logs on failure, retry for known flaky steps, gate releases on required checks.

## GitHub Actions Matrix

- `strategy.matrix` for `os: [macos-latest, windows-latest, ubuntu-latest]`
- Per-entry metadata: `target` triple, `artifact_globs`, `name_suffix`
- `permissions: contents: write` for release asset upload

## Windows Runner Setup

- Rust stable with MSVC target via `dtolnay/rust-toolchain@stable`
- Node + pnpm: `actions/setup-node` + pnpm setup; `pnpm install --frozen-lockfile`
- WebView2 present on hosted runners

## Linux Runner Setup

- Install Tauri deps: `libwebkit2gtk-4.1-dev`, `libgtk-3-dev`, `libayatana-appindicator3-dev`, `librsvg2-dev`, `patchelf`, `libssl-dev`
- Use `xvfb-run` only for GUI/E2E steps

## Artifact Naming

- Template: `OpenSCAD-Studio-{version}-{os}-{arch}.{ext}`
- macOS: `.dmg` (+ `.app.tar.gz` for updater)
- Windows: `.msi`
- Linux: `.AppImage` (+ `.deb`)

## Cross-Platform Testing

- **All OS**: `pnpm lint`, `pnpm typecheck`, `pnpm test`, basic Rust checks
- **Linux**: Playwright E2E (primary)
- **macOS**: optional Playwright E2E (secondary)
- **Windows**: start without Playwright unless stable infrastructure exists

## pnpm audit

- Dedicated job on ubuntu
- `pnpm audit --json` with machine-readable output
- Fail threshold: **fail on `high`+**, warn on `moderate`
- Short-lived allowlist for transitive issues (advisory IDs + expiry date)

## cargo audit

- Via `rustsec/audit-check` action or installed `cargo-audit`
- Run on ubuntu, pinned to `Cargo.lock`
- Fail on any RustSec vulnerability unless explicitly ignored with justification

## Release Artifact Upload

- Job A: "create release" (draft) → outputs `release_id`
- Job B (matrix): build per OS → upload assets to same `release_id`
- Avoids race conditions

## Build Caching

- Node: `actions/setup-node` with pnpm cache
- Rust: `Swatinem/rust-cache@v2` keyed by OS + `Cargo.lock`
- Keep caches OS-scoped

## Build Time Optimization

- Run audits + tests in parallel with builds (don't block start)
- Avoid rebuilding web assets repeatedly

## Error Handling

- Upload build logs/tauri bundler output as artifacts on failure
- Single retry for known flaky network steps
- Gate releases on required checks once stable

## Code Signing

- macOS: existing secrets-based signing identities in mac job
- Windows: PFX certificate in GitHub Secrets; import at runtime; sign with `signtool`
- Signing conditional: only on tags, never on PRs
- Verification step after signing

## Testing Matrix

- **All OS**: lint, typecheck, unit tests
- **Linux**: Playwright E2E (primary)
- Release gating: require All OS checks + audits before publishing

## Edge Cases

- Force `TZ=UTC` and stable locale for tests
- Windows: avoid asserting raw paths; avoid CRLF-sensitive snapshots
- Font/render differences in Playwright: prefer role/text selectors

## Dependency Pinning

- Enforce `pnpm install --frozen-lockfile` everywhere
- CI check: `pnpm-lock.yaml` and `Cargo.lock` unchanged after install/build
- Pin pnpm version via `packageManager` in `package.json` + Corepack
