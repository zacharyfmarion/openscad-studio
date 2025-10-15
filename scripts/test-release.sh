#!/bin/bash

# Simple test script for GitHub release creation

VERSION="0.1.0"
RELEASE_NOTES="Test release notes"

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

info() {
    echo -e "${BLUE}ℹ $1${NC}"
}

success() {
    echo -e "${GREEN}✓ $1${NC}"
}

# Find the built artifacts
TAURI_DIR="apps/ui/src-tauri"
BUNDLE_DIR="$TAURI_DIR/target/release/bundle"

# Detect platform
PLATFORM=$(uname -s)
ARTIFACTS=()

if [ "$PLATFORM" == "Darwin" ]; then
    # macOS
    if [ -f "$BUNDLE_DIR/dmg"/*.dmg ]; then
        ARTIFACTS+=("$BUNDLE_DIR/dmg"/*.dmg)
    fi
    if [ -f "$BUNDLE_DIR/macos"/*.app.tar.gz ]; then
        ARTIFACTS+=("$BUNDLE_DIR/macos"/*.app.tar.gz)
    fi
fi

info "Found ${#ARTIFACTS[@]} artifact(s)"
for artifact in "${ARTIFACTS[@]}"; do
    echo "  - $artifact"
done

# Prepare release notes
GITHUB_NOTES=$(echo "$RELEASE_NOTES" | sed 's/"/\\"/g')

# Unset GH_HOST to avoid conflicts with git remotes
unset GH_HOST

# Create release with gh CLI
info "Creating GitHub release for v$VERSION..."

if [ ${#ARTIFACTS[@]} -eq 0 ]; then
    # Create release without artifacts
    gh release create "v$VERSION" \
        --title "v$VERSION" \
        --notes "$GITHUB_NOTES" \
        --verify-tag
else
    # Create release with artifacts
    gh release create "v$VERSION" \
        --title "v$VERSION" \
        --notes "$GITHUB_NOTES" \
        --verify-tag \
        "${ARTIFACTS[@]}"
fi

success "GitHub release created successfully"
echo ""
echo -e "Release URL: ${BLUE}$(gh release view "v$VERSION" --json url -q .url)${NC}"
