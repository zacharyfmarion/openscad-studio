# PR 74 Test Expansion

## Goal

Expand unit coverage for all behavior introduced by PR #74 (`[codex] Harden AI error reporting and Sentry noise filtering`) and move the branch onto the latest `main`.

## Approach

1. Rebase the PR branch onto `origin/main` so test work happens on the current repo/test harness.
2. Review the rebased diff and current tests to find coverage gaps across:
   - AI/provider failure classification
   - nested error normalization / structured error detail preservation
   - Sentry noise filtering and sanitization behavior
   - UI integration points that changed in `App.tsx` and `ModelSelector.tsx`
3. Add focused unit tests for the missing behaviors.
4. Run the focused test suite and any adjacent tests affected by the rebase.
5. Commit and push the updated branch.

## Files Likely In Scope

- `apps/ui/src/App.tsx`
- `apps/ui/src/components/ModelSelector.tsx`
- `apps/ui/src/hooks/useAiAgent.ts`
- `apps/ui/src/sentry.ts`
- `apps/ui/src/utils/aiErrors.ts`
- `apps/ui/src/utils/notifications.ts`
- `apps/ui/src/utils/sentryNoise.ts`
- corresponding `__tests__` files

## Checklist

- [x] Inspect PR #74 scope
- [x] Rebase onto latest `origin/main`
- [x] Identify coverage gaps after rebase
- [x] Add extensive unit coverage
- [x] Run focused validation
- [ ] Push updated branch
