#!/bin/bash
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Helper functions
error() {
    echo -e "${RED}Error: $1${NC}" >&2
    exit 1
}

success() {
    echo -e "${GREEN}✓ $1${NC}"
}

info() {
    echo -e "${BLUE}ℹ $1${NC}"
}

warn() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

confirm() {
    echo -ne "${YELLOW}$1 [y/N]: ${NC}"
    read response
    case "$response" in
        [yY][eE][sS]|[yY])
            return 0
            ;;
        *)
            return 1
            ;;
    esac
}

# Check if we're in the right directory
if [ ! -f "package.json" ] || [ ! -d "apps/ui/src-tauri" ]; then
    error "This script must be run from the project root directory"
fi

# Check for required tools
command -v gh >/dev/null 2>&1 || error "GitHub CLI (gh) is required. Install with: brew install gh"
command -v jq >/dev/null 2>&1 || error "jq is required. Install with: brew install jq"
command -v pnpm >/dev/null 2>&1 || error "pnpm is required. Install with: npm install -g pnpm"

info "Starting release process for OpenSCAD Studio"

# Check we're on main branch
CURRENT_BRANCH=$(git branch --show-current)
if [ "$CURRENT_BRANCH" != "main" ]; then
    warn "You are on branch '$CURRENT_BRANCH', not 'main'"
    confirm "Continue anyway?" || exit 0
fi

# Check for uncommitted changes
if ! git diff-index --quiet HEAD --; then
    error "You have uncommitted changes. Please commit or stash them first."
fi

# Get current version
CURRENT_VERSION=$(jq -r '.version' package.json)
info "Current version: $CURRENT_VERSION"

# Prompt for new version
echo ""
echo -ne "${BLUE}Enter new version number (e.g., 0.2.0): ${NC}"
read NEW_VERSION

if [ -z "$NEW_VERSION" ]; then
    error "Version number cannot be empty"
fi

# Validate version format (semantic versioning)
if ! [[ "$NEW_VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    error "Invalid version format. Use semantic versioning (e.g., 0.2.0)"
fi

info "New version will be: $NEW_VERSION"
echo ""

# Prompt for release notes
echo -e "${BLUE}Enter release notes (press Ctrl+D when done):${NC}"
RELEASE_NOTES=$(cat)

if [ -z "$RELEASE_NOTES" ]; then
    warn "No release notes provided"
    confirm "Continue without release notes?" || exit 0
fi

# Confirmation
echo ""
echo -e "${YELLOW}═══════════════════════════════════════════${NC}"
echo -e "${YELLOW}Release Summary${NC}"
echo -e "${YELLOW}═══════════════════════════════════════════${NC}"
echo -e "Version:        ${GREEN}$NEW_VERSION${NC}"
echo -e "Current branch: ${BLUE}$CURRENT_BRANCH${NC}"
echo -e "Release notes:"
echo -e "${BLUE}$RELEASE_NOTES${NC}"
echo -e "${YELLOW}═══════════════════════════════════════════${NC}"
echo ""

confirm "Proceed with release?" || exit 0

# Update version in package.json files
info "Updating version numbers..."
jq ".version = \"$NEW_VERSION\"" package.json > package.json.tmp && mv package.json.tmp package.json
jq ".version = \"$NEW_VERSION\"" apps/ui/package.json > apps/ui/package.json.tmp && mv apps/ui/package.json.tmp apps/ui/package.json

# Update version in Cargo.toml
sed -i.bak "s/^version = \".*\"/version = \"$NEW_VERSION\"/" apps/ui/src-tauri/Cargo.toml
rm -f apps/ui/src-tauri/Cargo.toml.bak

# Update version in tauri.conf.json
TAURI_CONF="apps/ui/src-tauri/tauri.conf.json"
jq ".version = \"$NEW_VERSION\"" "$TAURI_CONF" > "$TAURI_CONF.tmp" && mv "$TAURI_CONF.tmp" "$TAURI_CONF"

# Update Cargo.lock
(cd apps/ui/src-tauri && cargo update -p openscad-studio)

success "Version numbers updated"

# Update CHANGELOG.md
info "Updating CHANGELOG.md..."
CHANGELOG_FILE="CHANGELOG.md"
TODAY=$(date +%Y-%m-%d)

# Create CHANGELOG.md if it doesn't exist
if [ ! -f "$CHANGELOG_FILE" ]; then
    cat > "$CHANGELOG_FILE" <<EOF
# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

EOF
fi

# Prepare changelog entry using a temporary file
TEMP_ENTRY=$(mktemp)
cat > "$TEMP_ENTRY" <<EOF
## [$NEW_VERSION] - $TODAY

$RELEASE_NOTES

EOF

# Insert the new entry into CHANGELOG
if grep -q "^## \[" "$CHANGELOG_FILE"; then
    # Insert before the first existing version entry
    TEMP_CHANGELOG=$(mktemp)
    awk '
        /^## \[/ && !inserted {
            while ((getline line < "'"$TEMP_ENTRY"'") > 0) {
                print line
            }
            close("'"$TEMP_ENTRY"'")
            inserted = 1
        }
        { print }
    ' "$CHANGELOG_FILE" > "$TEMP_CHANGELOG"
    mv "$TEMP_CHANGELOG" "$CHANGELOG_FILE"
else
    # No previous entries, append after preamble
    cat "$TEMP_ENTRY" >> "$CHANGELOG_FILE"
fi

# Clean up temp file
rm -f "$TEMP_ENTRY"

success "CHANGELOG.md updated"

# Update website download links
info "Updating website download links..."
WEBSITE_FILE="docs/index.html"
if [ -f "$WEBSITE_FILE" ]; then
    # Update download links to point to new version
    # Pattern: releases/download/v{VERSION}/OpenSCAD-Studio-{VERSION}-aarch64.dmg
    sed -i.bak "s|releases/download/v[0-9]*\.[0-9]*\.[0-9]*/OpenSCAD-Studio-[0-9]*\.[0-9]*\.[0-9]*-aarch64\.dmg|releases/download/v$NEW_VERSION/OpenSCAD-Studio-$NEW_VERSION-aarch64.dmg|g" "$WEBSITE_FILE"
    rm -f "$WEBSITE_FILE.bak"
    success "Website download links updated"
else
    warn "Website file not found at $WEBSITE_FILE, skipping"
fi

# Fix .gitignore to allow Cargo.lock for Tauri app (application should track Cargo.lock)
info "Updating .gitignore to track Tauri app's Cargo.lock..."
if grep -q "^Cargo.lock$" .gitignore; then
    # Replace global Cargo.lock ignore with specific patterns
    sed -i.bak 's/^Cargo\.lock$/# Note: Cargo.lock is tracked for Tauri apps (apps\/ui\/src-tauri\/Cargo.lock)\n# Only ignore Cargo.lock in workspace root or packages\n\/Cargo.lock\npackages\/**\/Cargo.lock/' .gitignore
    rm -f .gitignore.bak
    success ".gitignore updated to allow Tauri app's Cargo.lock"
else
    info ".gitignore already configured correctly for Cargo.lock"
fi

# Build the application BEFORE committing/tagging (verify it works first)
info "Building application for release..."
info "This may take several minutes..."

if pnpm tauri:build; then
    success "Application built successfully"
else
    # Revert version changes if build fails
    warn "Build failed. Reverting version changes..."
    git checkout package.json apps/ui/package.json apps/ui/src-tauri/Cargo.toml apps/ui/src-tauri/Cargo.lock apps/ui/src-tauri/tauri.conf.json CHANGELOG.md .gitignore docs/index.html 2>/dev/null || true
    error "Build failed. All changes have been reverted. Please fix the build errors and try again."
fi

# Commit version bump
info "Committing version bump..."
git add package.json apps/ui/package.json apps/ui/src-tauri/Cargo.toml apps/ui/src-tauri/Cargo.lock apps/ui/src-tauri/tauri.conf.json CHANGELOG.md .gitignore docs/index.html
git commit -m "chore: bump version to $NEW_VERSION"
success "Version bump committed"

# Create git tag
info "Creating git tag v$NEW_VERSION..."
git tag -a "v$NEW_VERSION" -m "Release v$NEW_VERSION"
success "Git tag created"

# Push changes and tag
info "Pushing to remote..."
git push origin "$CURRENT_BRANCH"
git push origin "v$NEW_VERSION"
success "Changes and tag pushed to remote"

# Find the built artifacts
TAURI_DIR="apps/ui/src-tauri"
BUNDLE_DIR="$TAURI_DIR/target/release/bundle"

# Detect platform and find artifacts
PLATFORM=$(uname -s)
ARTIFACTS=()

if [ "$PLATFORM" == "Darwin" ]; then
    # macOS - use compgen to safely check for glob matches
    shopt -s nullglob
    for f in "$BUNDLE_DIR/dmg"/*.dmg; do
        ARTIFACTS+=("$f")
    done
    for f in "$BUNDLE_DIR/macos"/*.app.tar.gz; do
        ARTIFACTS+=("$f")
    done
    # Also include signature files for updater
    for f in "$BUNDLE_DIR/macos"/*.app.tar.gz.sig; do
        ARTIFACTS+=("$f")
    done
    shopt -u nullglob
elif [ "$PLATFORM" == "Linux" ]; then
    shopt -s nullglob
    for f in "$BUNDLE_DIR/appimage"/*.AppImage; do
        ARTIFACTS+=("$f")
    done
    for f in "$BUNDLE_DIR/deb"/*.deb; do
        ARTIFACTS+=("$f")
    done
    # Signature files
    for f in "$BUNDLE_DIR/appimage"/*.AppImage.sig; do
        ARTIFACTS+=("$f")
    done
    shopt -u nullglob
elif [ "$PLATFORM" == "Windows_NT" ] || [[ "$PLATFORM" == MINGW* ]]; then
    shopt -s nullglob
    for f in "$BUNDLE_DIR/msi"/*.msi; do
        ARTIFACTS+=("$f")
    done
    for f in "$BUNDLE_DIR/nsis"/*.exe; do
        ARTIFACTS+=("$f")
    done
    # Signature files
    for f in "$BUNDLE_DIR/nsis"/*.exe.sig; do
        ARTIFACTS+=("$f")
    done
    shopt -u nullglob
fi

if [ ${#ARTIFACTS[@]} -eq 0 ]; then
    warn "No build artifacts found locally. GitHub Actions will build for all platforms."
else
    info "Found ${#ARTIFACTS[@]} local artifact(s)"
fi

# Note: We don't create a GitHub release here because tauri-action in GitHub Actions
# will create a draft release with all platform builds. The tag push triggers that workflow.
info "Tag pushed. GitHub Actions will now build for all platforms and create a draft release."
info "Monitor progress at: https://github.com/zacharyfmarion/openscad-studio/actions"

# Summary
echo ""
echo -e "${GREEN}═══════════════════════════════════════════${NC}"
echo -e "${GREEN}Release v$NEW_VERSION initiated successfully!${NC}"
echo -e "${GREEN}═══════════════════════════════════════════${NC}"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo "  1. GitHub Actions is now building for all platforms (macOS, Windows, Linux)"
echo "  2. Monitor build progress: ${BLUE}https://github.com/zacharyfmarion/openscad-studio/actions${NC}"
echo "  3. Once builds complete, a draft release will be created automatically"
echo "  4. Review and publish the draft release on GitHub"
echo "  5. Test the downloadable artifacts"
echo "  6. Announce the release to users"
echo ""

success "All done! 🎉"
