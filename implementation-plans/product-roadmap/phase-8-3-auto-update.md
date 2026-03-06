# Phase 8.3: Auto-Update

## Summary

Use Tauri's updater plugin with a **stable manifest URL hosted as a GitHub Release asset** (`releases/latest/download/latest.json`), implement a custom React update banner/dialog, and put all signing + manifest generation into `release.yml`.

## Effort Estimate

Medium (1–2d) for solid single-channel updater across all platforms; Large (3d+) if Windows/Linux packaging isn't currently automated.

## Action Plan

1. **Enable updater plugin** (Rust + JS): add crate to `src-tauri/Cargo.toml`, register in builder, add JS package.
2. **Configure `tauri.conf.json`**: add updater plugin config with endpoint pointing at GitHub Releases + embed public key.
3. **Standardize update artifacts + manifest**: per-platform artifact (macOS `.app.tar.gz`, Windows MSI, Linux AppImage) + `latest.json` with `platform → { url, signature }`.
4. **Set up signature verification**: generate Ed25519 keypair once; store private key in GitHub Secrets; embed public key in `tauri.conf.json`.
5. **Update CI/CD (`release.yml`)**: sign artifacts, generate `latest.json`, upload as release assets.
6. **Build UI + settings hooks**: notification banner/dialog with changelog, "Download & Restart", progress; settings toggle + "Check now".
7. **Implement full update flow**: check → notify → download → verify signature → install → relaunch; gate on unsaved work, prevent downgrades.

## Tauri Updater Plugin Config

```json
{
  "plugins": {
    "updater": {
      "endpoints": ["https://github.com/<owner>/<repo>/releases/latest/download/latest.json"],
      "pubkey": "<ED25519_PUBLIC_KEY>"
    }
  }
}
```

## Update Manifest Format (`latest.json`)

```json
{
  "version": "0.8.3",
  "notes": "## Changes\n- …\n",
  "pub_date": "2026-03-06T00:00:00Z",
  "platforms": {
    "darwin-aarch64": {
      "url": "https://github.com/.../OpenSCAD-Studio_0.8.3_aarch64.app.tar.gz",
      "signature": "<base64_signature>"
    },
    "windows-x86_64": {
      "url": "https://github.com/.../OpenSCAD-Studio_0.8.3_x64.msi",
      "signature": "<base64_signature>"
    },
    "linux-x86_64": {
      "url": "https://github.com/.../OpenSCAD-Studio_0.8.3_x86_64.AppImage",
      "signature": "<base64_signature>"
    }
  }
}
```

## Signature Verification

- Generate Ed25519 updater keypair once
- Embed public key in `tauri.conf.json`
- Sign each platform artifact during CI with private key from `secrets.UPDATER_PRIVATE_KEY`
- Fail closed on signature mismatch

## CI/CD Changes

- Build platform artifacts (existing behavior)
- Sign each artifact with updater private key
- Generate `latest.json` using release tag + notes + artifact URLs + signatures
- Upload `latest.json` + artifacts to GitHub Release

## UI Design

- Banner/dialog states: `Idle → Available(version) → Downloading(progress) → Installing → Restarting / Error`
- Changelog: render Markdown from `notes`
- Progress: percent + bytes; always show "Cancel" during download

## Update Flow

1. Check for updates (startup + every 24h + manual)
2. Show notification with version + changelog
3. User clicks "Download & Restart"
4. Download with progress → verify signature → install
5. If success: call `relaunch()`
6. If signature mismatch: hard-stop with error + "Open release page" fallback

## Check Frequency

- Default: on startup + once per 24h (store last-check timestamp)
- Manual "Check now" bypasses throttling

## Settings

- `autoCheckUpdates: boolean` in existing settings store
- `lastUpdateCheckAt: ISO string`
- "Check now" button

## Platform-Specific Notes

- **macOS**: updater installs into existing `.app`; keep DMG for distribution, publish `.app.tar.gz` for auto-update
- **Windows (MSI)**: ensure updater mechanism supported by bundling target
- **Linux (AppImage)**: updater replaces AppImage; ensure permissions/executable bit preserved

## Error Handling

- Network failure/timeouts: retry + "Try again later" + link to releases
- Corrupt download/signature mismatch: delete temp file, surface error, do not install
- Disk space: preflight check if available; fail with "Free X GB and retry"

## Rollback

- Rely on updater's atomic swap (download temp + verify + replace)
- If install fails: keep running old version + show "Update failed; still on X.Y.Z"

## Edge Cases

- **Unsaved work**: if editor buffer dirty, show confirmation before restart; allow "Download now, restart later"
- **Downgrade prevention**: only accept `manifest.version > currentVersion`

## Testing Strategy

- Local mock manifest server in dev to test UI states and failure modes
- Staging/beta channel later: `beta.json` endpoint + prerelease workflow

## Changelog Management

- Source of truth: GitHub Release notes; CI injects release body into manifest `notes`
- UI links to full release page for details

## Security

- HTTPS-only endpoints (GitHub)
- Signature verification required; fail closed
- Persist "highest seen version" to mitigate downgrade attacks
