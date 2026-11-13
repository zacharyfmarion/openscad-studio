# Generalize model lifecycle migration and update hosted defaults

## Goal
Keep the copilot usable after provider retirements, use latest Sonnet/Sol defaults, and make future retirement updates data-only changes.

## Approach
- Provider-keyed exact-ID replacement registry shared by saved selections, discovery, and cache invalidation. Each retired model can have its own target; no family-specific migration code.
- Latest defaults: `claude-sonnet-5-5` and `gpt-6.1-sol`, verified against primary provider documentation. Default changes do not overwrite an explicitly saved, still-active model.
- Include retired Sonnet, Opus, Haiku, and OpenAI o3-mini entries to exercise the same mechanism across families/providers. Preserve unknown IDs and all OpenAI-compatible selections.
- Update request options/history handling for latest-model reasoning compatibility, with mocked protocol tests. Do not change unrelated E2E workflows.

References:
- https://platform.claude.com/docs/en/about-claude/model-deprecations
- https://platform.claude.com/docs/en/models/sonnet-5-5/migration-guide
- https://developers.openai.com/api/docs/models/gpt-6.1-sol
- https://developers.openai.com/api/docs/guides/latest-model
- https://developers.openai.com/api/docs/deprecations

## Affected Areas
- Shared model catalog, discovery, and persistence
- Copilot request options and conversation history
- Welcome/chat defaults and regression tests

## Checklist
- [x] Open initial draft PR #160 and verify preview
- [x] Verify latest defaults and implement generic replacement registry
- [x] Validate latest-model protocol compatibility
- [x] Run full baseline and web build after changes
- [ ] Update PR #160 and inspect exact-commit CI/preview

## Validation
Updated revision passed all 676 tests in 86 suites, full baseline checks (formatting, lint, type-check, unit tests), and production web build. Four new suites cover the generic registry and latest-model protocol behavior, including actual installed-SDK request serialization with mocked fetch. No live model calls or quality evaluation performed.
