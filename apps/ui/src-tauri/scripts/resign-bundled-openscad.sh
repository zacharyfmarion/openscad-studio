#!/usr/bin/env bash

set -euo pipefail

APP_PATH="${1:-}"
IDENTITY="${APPLE_SIGNING_IDENTITY:-}"

if [ -z "$APP_PATH" ]; then
  echo "Usage: $0 <path-to-OpenSCAD.app>" >&2
  exit 1
fi

if [ ! -d "$APP_PATH" ]; then
  echo "OpenSCAD app bundle not found at: $APP_PATH" >&2
  exit 1
fi

if [ -z "$IDENTITY" ]; then
  echo "APPLE_SIGNING_IDENTITY must be set" >&2
  exit 1
fi

sign_path() {
  local path="$1"

  echo "Signing $path"
  codesign --force --sign "$IDENTITY" --timestamp "$path"
}

sign_runtime_path() {
  local path="$1"

  echo "Signing with hardened runtime $path"
  codesign --force --sign "$IDENTITY" --timestamp --options runtime "$path"
}

echo "Preparing bundled OpenSCAD app at $APP_PATH"
xattr -cr "$APP_PATH" 2>/dev/null || true

declare -a MACH_O_FILES=()
while IFS= read -r -d '' path; do
  if file -b "$path" | grep -q 'Mach-O'; then
    MACH_O_FILES+=("$path")
  fi
done < <(find "$APP_PATH/Contents" -type f -print0)

for path in "${MACH_O_FILES[@]}"; do
  sign_path "$path"
done

declare -a NESTED_BUNDLES=()
while IFS= read -r -d '' path; do
  NESTED_BUNDLES+=("$path")
done < <(
  find "$APP_PATH/Contents" -depth -type d \
    \( -name '*.framework' -o -name '*.app' -o -name '*.xpc' -o -name '*.bundle' -o -name '*.plugin' \) \
    -print0
)

for path in "${NESTED_BUNDLES[@]}"; do
  if [ "$path" = "$APP_PATH" ]; then
    continue
  fi

  sign_path "$path"
done

sign_runtime_path "$APP_PATH"

echo "Verifying $APP_PATH"
codesign --verify --deep --strict --verbose=2 "$APP_PATH"
codesign -dv --verbose=4 "$APP_PATH"

echo "Bundled OpenSCAD app re-sign complete"
