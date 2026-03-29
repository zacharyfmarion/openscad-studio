#!/usr/bin/env bash

set -euo pipefail

usage() {
  cat <<'EOF'
Usage: scripts/validate-changes.sh [options]

Run deterministic local validations for the current repo.

Options:
  --scope <baseline|formatter|rust|e2e-web>
      Add an explicit validation scope. Repeatable.
  --changed-file <path>
      Provide a changed file path so the script can infer extra scopes.
      Repeatable.
  --dry-run
      Print the selected scopes and commands without executing them.
  --help
      Show this help output.

Behavior:
  - Baseline validation always runs unless explicit scopes are provided without
    baseline.
  - Formatter and Rust scopes can be inferred from --changed-file paths.
  - E2E is intentionally opt-in via --scope e2e-web.
EOF
}

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

dry_run=false
declare -a explicit_scopes=()
declare -a changed_files=()

while (($# > 0)); do
  case "$1" in
    --scope)
      if (($# < 2)); then
        echo "Missing value for --scope" >&2
        exit 1
      fi
      explicit_scopes+=("$2")
      shift 2
      ;;
    --changed-file)
      if (($# < 2)); then
        echo "Missing value for --changed-file" >&2
        exit 1
      fi
      changed_files+=("$2")
      shift 2
      ;;
    --dry-run)
      dry_run=true
      shift
      ;;
    --help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

scope_exists() {
  local needle="$1"
  shift
  local item
  for item in "$@"; do
    if [[ "$item" == "$needle" ]]; then
      return 0
    fi
  done
  return 1
}

declare -a scopes=()

if ((${#explicit_scopes[@]} > 0)); then
  scopes=("${explicit_scopes[@]}")
else
  scopes=("baseline")

  for file in "${changed_files[@]}"; do
    case "$file" in
      apps/ui/src-tauri/*|apps/ui/src-tauri|**/Cargo.toml|**/Cargo.lock)
        if ! scope_exists "rust" "${scopes[@]}"; then
          scopes+=("rust")
        fi
        ;;
    esac

    case "$file" in
      apps/ui/src/utils/formatter/*|apps/ui/jest.formatter.config.cjs|apps/ui/tsconfig.formatter-tests.json)
        if ! scope_exists "formatter" "${scopes[@]}"; then
          scopes+=("formatter")
        fi
        ;;
    esac
  done
fi

declare -a normalized_scopes=()
for scope in "${scopes[@]}"; do
  case "$scope" in
    baseline|formatter|rust|e2e-web)
      if ((${#normalized_scopes[@]} == 0)) || ! scope_exists "$scope" "${normalized_scopes[@]}"; then
        normalized_scopes+=("$scope")
      fi
      ;;
    *)
      echo "Unsupported scope: $scope" >&2
      exit 1
      ;;
  esac
done

declare -a commands=()

for scope in "${normalized_scopes[@]}"; do
  case "$scope" in
    baseline)
      commands+=("pnpm format")
      commands+=("pnpm lint")
      commands+=("pnpm type-check")
      commands+=("pnpm test:unit")
      ;;
    formatter)
      commands+=("pnpm test:formatter:ci")
      ;;
    rust)
      commands+=("(cd apps/ui/src-tauri && cargo fmt --check)")
      commands+=("(cd apps/ui/src-tauri && cargo clippy --all-targets --all-features -- -D warnings)")
      commands+=("(cd apps/ui/src-tauri && cargo check --all-targets --all-features)")
      ;;
    e2e-web)
      commands+=("pnpm test:e2e:web")
      ;;
  esac
done

printf 'Selected scopes: %s\n' "${normalized_scopes[*]}"
if ((${#changed_files[@]} > 0)); then
  printf 'Changed files used for inference:\n'
  printf '  - %s\n' "${changed_files[@]}"
fi

printf 'Commands:\n'
printf '  - %s\n' "${commands[@]}"

if [[ "$dry_run" == true ]]; then
  exit 0
fi

for command in "${commands[@]}"; do
  echo "+ $command"
  eval "$command"
done
