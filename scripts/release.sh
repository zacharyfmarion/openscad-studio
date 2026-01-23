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
command -v jq >/dev/null 2>&1 || error "jq is required. Install with: brew install jq"

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

# Get new version from argument or prompt
if [ -n "$1" ]; then
    NEW_VERSION="$1"
else
    echo ""
    echo -ne "${BLUE}Enter new version number (e.g., 0.5.0): ${NC}"
    read NEW_VERSION
fi

if [ -z "$NEW_VERSION" ]; then
    error "Version number cannot be empty"
fi

# Validate version format (semantic versioning)
if ! [[ "$NEW_VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    error "Invalid version format. Use semantic versioning (e.g., 0.5.0)"
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

# Commit version bump
info "Committing version bump..."
git add package.json apps/ui/package.json apps/ui/src-tauri/Cargo.toml apps/ui/src-tauri/Cargo.lock apps/ui/src-tauri/tauri.conf.json CHANGELOG.md
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

# Summary
echo ""
echo -e "${GREEN}═══════════════════════════════════════════${NC}"
echo -e "${GREEN}Release v$NEW_VERSION triggered!${NC}"
echo -e "${GREEN}═══════════════════════════════════════════${NC}"
echo ""
echo "GitHub Actions will now:"
echo "  1. Build macOS DMGs (ARM + Intel)"
echo "  2. Create a GitHub Release"
echo "  3. Update the Homebrew cask automatically"
echo ""
echo -e "Monitor: ${BLUE}https://github.com/zacharyfmarion/openscad-studio/actions${NC}"
echo ""
success "Done! No further action needed. 🎉"
