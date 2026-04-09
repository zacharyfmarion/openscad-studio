# Sentry AI Error Hardening

## Goal

Reduce noisy Sentry issues from AI provider failures by distinguishing expected provider/config/network errors from real application faults, while improving displayed and captured error messages.

## Approach

- Audit the AI request and model-refresh error paths against recent Sentry issues.
- Add regression tests for error normalization and Sentry capture decisions.
- Treat expected provider/network/configuration failures as handled UI errors that should not create Sentry exceptions.
- Preserve user-visible error toasts with clearer messages for billing, auth, model, and connectivity failures.

## Affected Files

- `apps/ui/src/utils/notifications.ts`
- `apps/ui/src/components/ModelSelector.tsx`
- `apps/ui/src/App.tsx`
- `apps/ui/src/hooks/useAiAgent.ts`
- related tests under `apps/ui/src/**/__tests__`

## Checklist

- [x] Triage recent Sentry issues and identify actionable first-party defects
- [x] Add failing tests for normalization and capture policy
- [x] Patch runtime error handling for AI stream and model refresh flows
- [x] Run targeted tests and verify they pass
- [ ] Publish a PR for the actionable fix
