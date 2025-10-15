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

# Commit version bump
info "Committing version bump..."
git add package.json apps/ui/package.json apps/ui/src-tauri/Cargo.toml apps/ui/src-tauri/Cargo.lock CHANGELOG.md .gitignore
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

# Build the application
info "Building application for release..."
info "This may take several minutes..."

if pnpm tauri:build; then
    success "Application built successfully"
else
    error "Build failed. Please check the errors above."
fi

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
elif [ "$PLATFORM" == "Linux" ]; then
    # Linux
    if [ -f "$BUNDLE_DIR/appimage"/*.AppImage ]; then
        ARTIFACTS+=("$BUNDLE_DIR/appimage"/*.AppImage)
    fi
    if [ -f "$BUNDLE_DIR/deb"/*.deb ]; then
        ARTIFACTS+=("$BUNDLE_DIR/deb"/*.deb)
    fi
elif [ "$PLATFORM" == "Windows_NT" ] || [[ "$PLATFORM" == MINGW* ]]; then
    # Windows
    if [ -f "$BUNDLE_DIR/msi"/*.msi ]; then
        ARTIFACTS+=("$BUNDLE_DIR/msi"/*.msi)
    fi
    if [ -f "$BUNDLE_DIR/nsis"/*.exe ]; then
        ARTIFACTS+=("$BUNDLE_DIR/nsis"/*.exe)
    fi
fi

if [ ${#ARTIFACTS[@]} -eq 0 ]; then
    warn "No build artifacts found. Skipping artifact upload."
else
    info "Found ${#ARTIFACTS[@]} artifact(s) to upload"
fi

# Create GitHub release
info "Creating GitHub release..."

# Prepare release notes for GitHub (escape special characters)
GITHUB_NOTES=$(echo "$RELEASE_NOTES" | sed 's/"/\\"/g')

# Create release with gh CLI
if [ ${#ARTIFACTS[@]} -eq 0 ]; then
    # Create release without artifacts
    gh release create "v$NEW_VERSION" \
        --title "v$NEW_VERSION" \
        --notes "$GITHUB_NOTES" \
        --verify-tag
else
    # Create release with artifacts
    gh release create "v$NEW_VERSION" \
        --title "v$NEW_VERSION" \
        --notes "$GITHUB_NOTES" \
        --verify-tag \
        "${ARTIFACTS[@]}"
fi

success "GitHub release created successfully"

# Summary
echo ""
echo -e "${GREEN}═══════════════════════════════════════════${NC}"
echo -e "${GREEN}Release v$NEW_VERSION completed successfully!${NC}"
echo -e "${GREEN}═══════════════════════════════════════════${NC}"
echo ""
echo -e "Release URL: ${BLUE}$(gh release view "v$NEW_VERSION" --json url -q .url)${NC}"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo "  1. Verify the release on GitHub"
echo "  2. Test the downloadable artifacts"
echo "  3. Announce the release to users"
echo ""

success "All done! 🎉"
