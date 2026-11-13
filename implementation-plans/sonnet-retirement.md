# Migrate deprecated Sonnet selections

## Goal
Keep new and existing Anthropic copilot users working after Sonnet 4.5 retires on November 30, 2026.

## Approach
Use the supported `claude-sonnet-4-6` as a compatibility-focused replacement. Anthropic lists it as active, with retirement no sooner than February 17, 2027. The latest recommended replacement is Sonnet 5.5, but its always-on thinking and conversation-bound thinking changes warrant a separate agent-loop upgrade, rather than expanding this retirement fix.

References:
- https://platform.claude.com/docs/en/about-claude/model-deprecations
- https://platform.claude.com/docs/en/models/sonnet-5-5/whats-new-sonnet-5-5

Migrate only exact known legacy Sonnet IDs on the Anthropic provider, preserve other models and local endpoints, and update both storage formats. Remove these IDs from fetched/cached menus so they cannot be selected again. Centralize component defaults.

## Affected Areas
- Shared model catalog and model discovery
- Persisted provider-aware and legacy selections
- Welcome/chat defaults and regression tests

## Checklist
- [x] Verify official retirement and supported replacement
- [x] Implement provider-scoped migration and shared defaults
- [x] Add regression coverage and run baseline validation
- [ ] Open draft PR against main and inspect CI/preview

## Validation
- Baseline passed: formatting (including Rust), lint, type-check, and all 635 tests in 82 suites.
- Production web build passed (existing bundle-size/browser-data warnings).
- Live model calls and browser E2E not run; mock provider regression coverage exercises selection and submission.
