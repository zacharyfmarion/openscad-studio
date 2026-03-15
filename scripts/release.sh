#!/bin/bash
set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

ROOT_PACKAGE_JSON="package.json"
UI_PACKAGE_JSON="apps/ui/package.json"
TAURI_CARGO_TOML="apps/ui/src-tauri/Cargo.toml"
TAURI_CONF="apps/ui/src-tauri/tauri.conf.json"
APP_INFO_FILE="apps/ui/src/constants/appInfo.ts"
CHANGELOG_FILE="CHANGELOG.md"
MAIN_BRANCH="main"

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
    read -r response
    case "$response" in
        [yY][eE][sS]|[yY])
            return 0
            ;;
        *)
            return 1
            ;;
    esac
}

usage() {
    cat <<EOF
Usage:
  ./scripts/release.sh prepare <version> [--notes-file <path> | --notes <text> | --notes-stdin] [--yes]
  ./scripts/release.sh publish <version>

Commands:
  prepare   Create a release branch from origin/${MAIN_BRANCH}, bump versions,
            update CHANGELOG.md, push the branch, and open a PR to ${MAIN_BRANCH}.
  publish   Find the merged release PR for the version, verify the merged commit,
            create tag v<version> on that commit, and push the tag.
EOF
}

read_file_contents() {
    local path="$1"

    [ -f "$path" ] || error "Notes file not found: $path"
    cat "$path"
}

ensure_repo_root() {
    if [ ! -f "$ROOT_PACKAGE_JSON" ] || [ ! -f "$TAURI_CARGO_TOML" ]; then
        error "This script must be run from the project root directory"
    fi
}

require_command() {
    command -v "$1" >/dev/null 2>&1 || error "$1 is required"
}

require_clean_worktree() {
    if [ -n "$(git status --porcelain)" ]; then
        error "You have uncommitted or untracked changes. Please commit or stash them first."
    fi
}

validate_version() {
    if [ -z "${1:-}" ]; then
        error "Version number is required"
    fi

    if ! [[ "$1" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
        error "Invalid version format. Use semantic versioning (e.g., 0.10.0)"
    fi
}

branch_exists_local() {
    git show-ref --verify --quiet "refs/heads/$1"
}

branch_exists_remote() {
    git ls-remote --exit-code --heads origin "$1" >/dev/null 2>&1
}

tag_exists_local() {
    git show-ref --verify --quiet "refs/tags/$1"
}

tag_exists_remote() {
    git ls-remote --tags --refs origin "$1" | grep -q .
}

release_branch_name() {
    echo "release/v$1"
}

release_tag_name() {
    echo "v$1"
}

extract_changelog_section_from_stream() {
    local version="$1"

    awk -v version="$version" '
        BEGIN {
            in_section = 0
            found = 0
        }
        $0 ~ "^## \\[" version "\\] - " {
            in_section = 1
            found = 1
            next
        }
        /^## \[/ && in_section {
            exit
        }
        in_section {
            print
        }
        END {
            if (!found) {
                exit 2
            }
        }
    '
}

require_non_empty_text() {
    local text="$1"
    local description="$2"

    if [ -z "$(printf '%s' "$text" | tr -d '[:space:]')" ]; then
        error "$description cannot be empty"
    fi
}

collect_release_notes() {
    local notes_file="${1:-}"
    local inline_notes="${2:-}"
    local notes_from_stdin="${3:-false}"
    local release_notes=""

    if [ -n "$notes_file" ]; then
        release_notes=$(read_file_contents "$notes_file")
    elif [ -n "$inline_notes" ]; then
        release_notes="$inline_notes"
    elif [ "$notes_from_stdin" = "true" ]; then
        release_notes=$(cat)
    else
        echo -e "${BLUE}Enter release notes (press Ctrl+D when done):${NC}"
        release_notes=$(cat)
    fi

    require_non_empty_text "$release_notes" "Release notes"
    printf '%s' "$release_notes"
}

create_changelog_if_missing() {
    if [ -f "$CHANGELOG_FILE" ]; then
        return
    fi

    cat > "$CHANGELOG_FILE" <<EOF
# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

EOF
}

update_changelog() {
    local version="$1"
    local release_notes="$2"
    local today
    local temp_entry
    local temp_changelog

    create_changelog_if_missing

    today=$(date +%Y-%m-%d)
    temp_entry=$(mktemp)

    cat > "$temp_entry" <<EOF
## [$version] - $today

$release_notes

EOF

    if grep -q "^## \[" "$CHANGELOG_FILE"; then
        temp_changelog=$(mktemp)
        awk '
            /^## \[/ && !inserted {
                while ((getline line < "'"$temp_entry"'") > 0) {
                    print line
                }
                close("'"$temp_entry"'")
                inserted = 1
            }
            { print }
        ' "$CHANGELOG_FILE" > "$temp_changelog"
        mv "$temp_changelog" "$CHANGELOG_FILE"
    else
        cat "$temp_entry" >> "$CHANGELOG_FILE"
    fi

    rm -f "$temp_entry"
}

update_version_files() {
    local version="$1"

    info "Updating version numbers..."

    jq ".version = \"$version\"" "$ROOT_PACKAGE_JSON" > "${ROOT_PACKAGE_JSON}.tmp" && mv "${ROOT_PACKAGE_JSON}.tmp" "$ROOT_PACKAGE_JSON"
    jq ".version = \"$version\"" "$UI_PACKAGE_JSON" > "${UI_PACKAGE_JSON}.tmp" && mv "${UI_PACKAGE_JSON}.tmp" "$UI_PACKAGE_JSON"
    jq ".version = \"$version\"" "$TAURI_CONF" > "${TAURI_CONF}.tmp" && mv "${TAURI_CONF}.tmp" "$TAURI_CONF"

    sed -i.bak "s/^version = \".*\"/version = \"$version\"/" "$TAURI_CARGO_TOML"
    rm -f "${TAURI_CARGO_TOML}.bak"

    sed -i.bak "s/^export const APP_VERSION = '.*';/export const APP_VERSION = '$version';/" "$APP_INFO_FILE"
    rm -f "${APP_INFO_FILE}.bak"

    (cd apps/ui/src-tauri && cargo update -p openscad-studio)

    info "Formatting modified JSON files..."
    pnpm prettier --write "$ROOT_PACKAGE_JSON" "$UI_PACKAGE_JSON" "$TAURI_CONF"

    success "Version files updated"
}

create_release_commit() {
    local version="$1"

    git add "$ROOT_PACKAGE_JSON" \
        "$UI_PACKAGE_JSON" \
        "$TAURI_CARGO_TOML" \
        "apps/ui/src-tauri/Cargo.lock" \
        "$TAURI_CONF" \
        "$APP_INFO_FILE" \
        "$CHANGELOG_FILE"

    git commit -m "chore: prepare release v$version"
}

create_release_pr() {
    local version="$1"
    local release_branch="$2"
    local pr_title="chore: prepare release v$version"
    local pr_body

    pr_body=$(cat <<EOF
## Summary

- prepare release v$version
- update release version files
- add changelog entry for v$version

## Release flow

After this PR is merged to \`$MAIN_BRANCH\`, run:

\`\`\`bash
./scripts/release.sh publish $version
\`\`\`
EOF
)

    info "Opening pull request..."
    gh pr create \
        --base "$MAIN_BRANCH" \
        --head "$release_branch" \
        --title "$pr_title" \
        --body "$pr_body"
}

extract_version_from_ref() {
    local ref="$1"
    local path="$2"
    git show "${ref}:${path}" | jq -r '.version'
}

extract_cargo_version_from_ref() {
    local ref="$1"
    git show "${ref}:${TAURI_CARGO_TOML}" | sed -n 's/^version = "\(.*\)"/\1/p' | head -n 1
}

extract_app_info_version_from_ref() {
    local ref="$1"
    git show "${ref}:${APP_INFO_FILE}" | sed -n "s/^export const APP_VERSION = '\\(.*\\)';/\\1/p"
}

verify_ref_versions() {
    local ref="$1"
    local version="$2"
    local current

    current=$(extract_version_from_ref "$ref" "$ROOT_PACKAGE_JSON")
    [ "$current" = "$version" ] || error "$ROOT_PACKAGE_JSON is $current at $ref, expected $version"

    current=$(extract_version_from_ref "$ref" "$UI_PACKAGE_JSON")
    [ "$current" = "$version" ] || error "$UI_PACKAGE_JSON is $current at $ref, expected $version"

    current=$(extract_cargo_version_from_ref "$ref")
    [ "$current" = "$version" ] || error "$TAURI_CARGO_TOML is $current at $ref, expected $version"

    current=$(extract_version_from_ref "$ref" "$TAURI_CONF")
    [ "$current" = "$version" ] || error "$TAURI_CONF is $current at $ref, expected $version"

    current=$(extract_app_info_version_from_ref "$ref")
    [ "$current" = "$version" ] || error "$APP_INFO_FILE is $current at $ref, expected $version"
}

extract_changelog_from_ref() {
    local ref="$1"
    local version="$2"

    git show "${ref}:${CHANGELOG_FILE}" | extract_changelog_section_from_stream "$version"
}

prepare_release() {
    local version="$1"
    local notes_file="${2:-}"
    local inline_notes="${3:-}"
    local notes_from_stdin="${4:-false}"
    local auto_confirm="${5:-false}"
    local release_branch
    local release_notes
    local current_version

    require_command jq
    require_command gh
    require_command pnpm
    require_command cargo
    require_clean_worktree

    release_branch=$(release_branch_name "$version")

    if branch_exists_local "$release_branch"; then
        error "Local branch $release_branch already exists"
    fi

    if branch_exists_remote "$release_branch"; then
        error "Remote branch $release_branch already exists"
    fi

    if tag_exists_local "$(release_tag_name "$version")" || tag_exists_remote "$(release_tag_name "$version")"; then
        error "Tag v$version already exists"
    fi

    info "Fetching origin/$MAIN_BRANCH..."
    git fetch origin "$MAIN_BRANCH"

    current_version=$(jq -r '.version' "$ROOT_PACKAGE_JSON")
    info "Current version: $current_version"
    info "New version will be: $version"
    echo ""

    release_notes=$(collect_release_notes "$notes_file" "$inline_notes" "$notes_from_stdin")

    echo ""
    echo -e "${YELLOW}═══════════════════════════════════════════${NC}"
    echo -e "${YELLOW}Release Preparation Summary${NC}"
    echo -e "${YELLOW}═══════════════════════════════════════════${NC}"
    echo -e "Version:        ${GREEN}$version${NC}"
    echo -e "Base branch:    ${BLUE}origin/$MAIN_BRANCH${NC}"
    echo -e "Release branch: ${BLUE}$release_branch${NC}"
    echo -e "Release notes:"
    echo -e "${BLUE}$release_notes${NC}"
    echo -e "${YELLOW}═══════════════════════════════════════════${NC}"
    echo ""

    if [ "$auto_confirm" != "true" ]; then
        confirm "Proceed with release preparation?" || exit 0
    fi

    info "Creating branch $release_branch from origin/$MAIN_BRANCH..."
    git checkout -b "$release_branch" "origin/$MAIN_BRANCH"

    update_version_files "$version"

    info "Updating CHANGELOG.md..."
    update_changelog "$version" "$release_notes"
    success "CHANGELOG.md updated"

    info "Creating release commit..."
    create_release_commit "$version"
    success "Release commit created"

    info "Pushing $release_branch to origin..."
    git push -u origin "$release_branch"

    create_release_pr "$version" "$release_branch"

    echo ""
    echo -e "${GREEN}═══════════════════════════════════════════${NC}"
    echo -e "${GREEN}Release preparation complete${NC}"
    echo -e "${GREEN}═══════════════════════════════════════════${NC}"
    echo ""
    echo "Next steps:"
    echo "  1. Review and merge the PR to $MAIN_BRANCH"
    echo "  2. Run ./scripts/release.sh publish $version"
    echo ""
    success "Done"
}

publish_release() {
    local version="$1"
    local tag_name
    local release_branch
    local pr_json
    local pr_count
    local merge_sha
    local pr_url
    local changelog_entry

    require_command jq
    require_command gh
    require_clean_worktree

    tag_name=$(release_tag_name "$version")
    release_branch=$(release_branch_name "$version")

    if tag_exists_local "$tag_name" || tag_exists_remote "$tag_name"; then
        error "Tag $tag_name already exists"
    fi

    info "Fetching origin/$MAIN_BRANCH and tags..."
    git fetch origin "$MAIN_BRANCH" --tags

    info "Looking up merged PR for $release_branch..."
    pr_json=$(gh pr list \
        --state merged \
        --base "$MAIN_BRANCH" \
        --head "$release_branch" \
        --json number,url,mergeCommit,headRefName)

    pr_count=$(printf '%s' "$pr_json" | jq 'length')
    if [ "$pr_count" -ne 1 ]; then
        error "Expected exactly one merged PR for $release_branch, found $pr_count"
    fi

    merge_sha=$(printf '%s' "$pr_json" | jq -r '.[0].mergeCommit.oid // empty')
    pr_url=$(printf '%s' "$pr_json" | jq -r '.[0].url')

    if [ -z "$merge_sha" ]; then
        error "Merged PR for $release_branch does not expose a merge commit SHA"
    fi

    git cat-file -e "${merge_sha}^{commit}" 2>/dev/null || error "Merge commit $merge_sha is not available locally"

    if ! git merge-base --is-ancestor "$merge_sha" "origin/$MAIN_BRANCH"; then
        error "Merge commit $merge_sha is not reachable from origin/$MAIN_BRANCH"
    fi

    info "Validating version files at $merge_sha..."
    verify_ref_versions "$merge_sha" "$version"

    info "Validating changelog entry for v$version..."
    changelog_entry=$(extract_changelog_from_ref "$merge_sha" "$version") || error "No CHANGELOG.md entry found for $version at $merge_sha"
    require_non_empty_text "$changelog_entry" "CHANGELOG entry for $version"

    info "Creating annotated tag $tag_name at $merge_sha..."
    git tag -a "$tag_name" "$merge_sha" -m "Release $tag_name"

    info "Pushing tag $tag_name to origin..."
    git push origin "refs/tags/$tag_name"

    echo ""
    echo -e "${GREEN}═══════════════════════════════════════════${NC}"
    echo -e "${GREEN}Release $tag_name published${NC}"
    echo -e "${GREEN}═══════════════════════════════════════════${NC}"
    echo ""
    echo "Tagged commit: $merge_sha"
    echo "Source PR:     $pr_url"
    echo ""
    echo "GitHub Actions will now:"
    echo "  1. Validate the tagged commit"
    echo "  2. Build macOS DMGs (ARM + Intel)"
    echo "  3. Create a GitHub Release from CHANGELOG.md"
    echo "  4. Update the Homebrew cask automatically"
    echo ""
    success "Done"
}

main() {
    local command="${1:-}"
    local version="${2:-}"
    local notes_file=""
    local inline_notes=""
    local notes_from_stdin="false"
    local auto_confirm="false"

    ensure_repo_root

    if [ -z "$command" ]; then
        usage
        exit 1
    fi

    case "$command" in
        -h|--help|help)
            usage
            return 0
            ;;
    esac

    shift 2 || true

    while [ $# -gt 0 ]; do
        case "$1" in
            --notes-file)
                [ $# -ge 2 ] || error "--notes-file requires a path"
                [ -z "$inline_notes" ] || error "Use only one of --notes-file, --notes, or --notes-stdin"
                [ "$notes_from_stdin" != "true" ] || error "Use only one of --notes-file, --notes, or --notes-stdin"
                notes_file="$2"
                shift 2
                ;;
            --notes)
                [ $# -ge 2 ] || error "--notes requires text"
                [ -z "$notes_file" ] || error "Use only one of --notes-file, --notes, or --notes-stdin"
                [ "$notes_from_stdin" != "true" ] || error "Use only one of --notes-file, --notes, or --notes-stdin"
                inline_notes="$2"
                shift 2
                ;;
            --notes-stdin)
                [ -z "$notes_file" ] || error "Use only one of --notes-file, --notes, or --notes-stdin"
                [ -z "$inline_notes" ] || error "Use only one of --notes-file, --notes, or --notes-stdin"
                notes_from_stdin="true"
                shift
                ;;
            --yes|-y)
                auto_confirm="true"
                shift
                ;;
            *)
                error "Unknown option: $1"
                ;;
        esac
    done

    case "$command" in
        prepare)
            validate_version "$version"
            info "Starting release preparation for OpenSCAD Studio"
            prepare_release "$version" "$notes_file" "$inline_notes" "$notes_from_stdin" "$auto_confirm"
            ;;
        publish)
            validate_version "$version"
            [ -z "$notes_file" ] || error "--notes-file is only supported for prepare"
            [ -z "$inline_notes" ] || error "--notes is only supported for prepare"
            [ "$notes_from_stdin" != "true" ] || error "--notes-stdin is only supported for prepare"
            [ "$auto_confirm" = "false" ] || error "--yes is only supported for prepare"
            info "Starting release publish for OpenSCAD Studio"
            publish_release "$version"
            ;;
        *)
            usage
            error "Unknown command: $command"
            ;;
    esac
}

main "$@"
