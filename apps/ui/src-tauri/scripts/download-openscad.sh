#!/usr/bin/env bash
#
# Download an OpenSCAD snapshot .app bundle for Tauri resource bundling.
#
# Downloads the macOS DMG from files.openscad.org/snapshots/, extracts the
# full OpenSCAD.app bundle (binary + Frameworks + PlugIns + Resources), and
# places it at binaries/OpenSCAD.app for Tauri to bundle as a resource.
#
# The binary is ~148MB including Qt6 frameworks and all dylib dependencies.
# It is NOT committed to git — CI downloads it fresh before each build.
#
# Gatekeeper / codesigning:
#   - Locally: the script strips quarantine attributes so the binary runs
#     without Gatekeeper blocking it during development.
#   - In CI: Tauri's build signs everything in the app bundle with the
#     Apple Developer certificate, then the DMG is notarized.
#
# Usage:
#   cd apps/ui/src-tauri
#   ./scripts/download-openscad.sh [version]
#
# Examples:
#   ./scripts/download-openscad.sh 2026.03.16
#   ./scripts/download-openscad.sh              # uses default version

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TAURI_DIR="$(dirname "$SCRIPT_DIR")"
BINARIES_DIR="$TAURI_DIR/binaries"

# Default snapshot version — update this when upgrading OpenSCAD
OPENSCAD_VERSION="${1:-2026.03.16}"
DMG_URL="https://files.openscad.org/snapshots/OpenSCAD-${OPENSCAD_VERSION}.dmg"

APP_DEST="$BINARIES_DIR/OpenSCAD.app"
BINARY_PATH="$APP_DEST/Contents/MacOS/OpenSCAD"

# Skip if already downloaded
if [ -d "$APP_DEST" ] && [ -f "$BINARY_PATH" ]; then
  echo "OpenSCAD.app already exists at $APP_DEST"
  echo "  Binary: $BINARY_PATH"
  "$BINARY_PATH" --version 2>&1 || true
  echo ""
  echo "To re-download, remove the directory first:"
  echo "  rm -rf $APP_DEST"
  exit 0
fi

echo "============================================"
echo "Downloading OpenSCAD ${OPENSCAD_VERSION}"
echo "URL: $DMG_URL"
echo "Destination: $APP_DEST"
echo "============================================"
echo ""

# Create temp directory
TMPDIR_PATH="$(mktemp -d)"
DMG_PATH="$TMPDIR_PATH/OpenSCAD.dmg"
MOUNT_POINT="$TMPDIR_PATH/openscad-mount"

cleanup() {
  if [ -d "$MOUNT_POINT" ]; then
    hdiutil detach "$MOUNT_POINT" -quiet 2>/dev/null || true
  fi
  rm -rf "$TMPDIR_PATH"
}
trap cleanup EXIT

# Download DMG
echo "Downloading DMG..."
curl -fSL --progress-bar -o "$DMG_PATH" "$DMG_URL"
echo "Downloaded ($(du -h "$DMG_PATH" | cut -f1))"
echo ""

# Mount DMG
echo "Mounting DMG..."
mkdir -p "$MOUNT_POINT"
hdiutil attach "$DMG_PATH" -mountpoint "$MOUNT_POINT" -nobrowse -quiet

# Verify the .app exists
SOURCE_APP="$MOUNT_POINT/OpenSCAD.app"
if [ ! -d "$SOURCE_APP" ]; then
  echo "Error: OpenSCAD.app not found in DMG"
  echo "Contents of mount:"
  ls -la "$MOUNT_POINT/"
  exit 1
fi

# Copy the full .app bundle
echo "Copying OpenSCAD.app bundle..."
mkdir -p "$BINARIES_DIR"
# Remove any previous partial download
rm -rf "$APP_DEST"
cp -R "$SOURCE_APP" "$APP_DEST"

echo "Copied ($(du -sh "$APP_DEST" | cut -f1))"
echo ""

# Strip quarantine attributes recursively (macOS Gatekeeper)
# This is essential for local development — without it, macOS will kill
# the binary on launch because it was downloaded from the internet.
echo "Stripping quarantine attributes..."
xattr -cr "$APP_DEST" 2>/dev/null || true

# Strip the existing code signature (it's from the OpenSCAD project,
# not from us). In CI, Tauri re-signs everything with our certificate.
# Locally, we run unsigned (ad-hoc sign).
echo "Ad-hoc signing for local development..."
codesign --force --deep --sign - "$APP_DEST" 2>/dev/null || true

# Verify the binary runs
echo ""
echo "Verifying binary..."
if "$BINARY_PATH" --version 2>&1; then
  echo ""
else
  echo "(version check produced no output — binary may still work)"
  echo ""
fi

echo "============================================"
echo "OpenSCAD ${OPENSCAD_VERSION} installed successfully"
echo "  App:    $APP_DEST"
echo "  Binary: $BINARY_PATH"
echo "  Size:   $(du -sh "$APP_DEST" | cut -f1)"
echo "============================================"
