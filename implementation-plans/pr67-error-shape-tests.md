# PR67 Error Shape Tests

## Goal

Expand PR `#67` test coverage so the error text helper is exercised across the provider and SDK error shapes this branch is expected to handle, especially the OpenAI and Anthropic shapes used by the installed `@ai-sdk/openai` and `@ai-sdk/anthropic` packages.

## Approach

1. Inspect the installed provider adapter sources and AI SDK error docs/source.
2. Add unit tests for provider-style payloads, `APICallError`-style objects, fetch/network failures, primitives, nested causes, and serialization fallbacks.
3. Adjust the helper if any real provider shape is not surfaced correctly.
4. Run the focused Jest suite and summarize the cases covered.

## Affected Files

- `apps/ui/src/utils/errorText.ts`
- `apps/ui/src/utils/__tests__/errorText.test.ts`

## Checklist

- [x] Inspect installed provider error shapes
- [x] Add exhaustive unit coverage for helper behavior
- [x] Adjust implementation if coverage reveals gaps
- [x] Run focused tests
