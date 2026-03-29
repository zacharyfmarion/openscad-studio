# Unit Test Coverage Priorities

## Goal

Add automated coverage for the most user-critical, lightly tested application logic in `apps/ui` and the currently untested share backend in `apps/web`, while keeping runtime behavior unchanged.

## Approach

1. Add the missing test infrastructure and coverage scripts first so the new suites can be run consistently.
2. Cover the highest-risk orchestration layers in `apps/ui`: AI flow, render flow, render service, platform bootstrap, and API key persistence.
3. Add dedicated unit tests for the Cloudflare Pages share helpers and routes in `apps/web`.
4. Add a few thin app-level harness tests only where top-level orchestration is difficult to prove through lower-level tests.
5. Run targeted coverage and test verification, then record any remaining gaps that should wait for a follow-up pass.

## Affected Areas

- `apps/ui/jest.config.cjs`
- `apps/ui/package.json`
- `apps/web/package.json`
- `package.json`
- `apps/web/jest.config.cjs`
- `apps/ui/src/hooks/useAiAgent.ts`
- `apps/ui/src/hooks/useOpenScad.ts`
- `apps/ui/src/services/renderService.ts`
- `apps/ui/src/platform/index.ts`
- `apps/ui/src/stores/apiKeyStore.ts`
- `apps/ui/src/App.tsx`
- `apps/web/functions/_lib/share.ts`
- `apps/web/functions/api/share.ts`
- `apps/web/functions/s/[[shareId]].ts`
- new test-only helpers under `apps/ui/src/**/__tests__` and `apps/web/functions/**/__tests__`

## Checklist

- [x] Create implementation plan file
- [x] Add `apps/ui` coverage scripts and per-file coverage thresholds
- [x] Add `apps/web` Jest setup and root scripts for web unit coverage
- [x] Add shared test helpers for AI streams, worker behavior, analytics, and Pages contexts
- [x] Add `useAiAgent` unit tests for streaming, error, cancellation, attachments, and checkpoint flows
- [x] Add `useOpenScad` unit tests for init, cache, dependency resolution, dimension fallback, and cleanup
- [x] Add `renderService` unit tests for parsing, cache behavior, worker lifecycle, export validation, and cancellation
- [x] Add `platform/index` and `apiKeyStore` unit tests
- [x] Add `_lib/share.ts` unit tests
- [x] Add `api/share.ts` route tests
- [x] Add `s/[[shareId]].ts` route tests
- [ ] Add thin `App.tsx` tests for top-level orchestration helpers
- [x] Run targeted test and coverage verification

## Notes

- The first pass should prioritize regressions that would break AI chat, rendering, or share-link behavior over broad component snapshots.
- Small private helper extraction is acceptable if needed to make the new tests reliable and maintainable.
- Existing `useShareEntry` and `useMobileLayout` coverage already exercises most of the top-level share-entry and mobile-shell orchestration. A small `App.tsx` helper pass is still a reasonable follow-up, but it is not blocking the critical risk-reduction target from this milestone.
