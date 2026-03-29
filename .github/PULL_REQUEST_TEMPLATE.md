# Summary

## What changed

-

## Why

-

## Implementation notes

-

# Testing

## Coverage checklist

- [ ] Backend unit tests added or updated for changed Rust behavior
- [ ] Client unit/component tests added or updated for changed frontend behavior
- [ ] E2E tests added or updated for net new user-facing flows
- [ ] No new tests were needed for this change

## Validation performed

- [ ] `pnpm format:check`
- [ ] `pnpm lint`
- [ ] `pnpm type-check`
- [ ] `pnpm test:unit`
- [ ] `pnpm test:formatter:ci`
- [ ] `pnpm test:e2e:web`
- [ ] `bash scripts/validate-changes.sh --dry-run ...`
- [ ] `cd apps/ui/src-tauri && cargo fmt --check`
- [ ] `cd apps/ui/src-tauri && cargo clippy --all-targets --all-features -- -D warnings`
- [ ] `cd apps/ui/src-tauri && cargo check --all-targets --all-features`

## Test details

- Describe what was validated locally.
- Note any tests intentionally skipped and why.

# Performance

## Performance impact

- [ ] Performance was considered for this change
- [ ] No meaningful performance impact is expected

## Justification

- Describe any expected performance impact, tradeoffs, benchmarks, or why performance is unchanged.

# UI changes

## Screenshots or recordings

- N/A

# Issue link

- Closes #
