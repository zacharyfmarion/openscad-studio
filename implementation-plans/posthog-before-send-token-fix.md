# PostHog Before Send Token Fix

## Goal

Stop the production PostHog 401 errors by preserving the SDK's required auth token while still scrubbing sensitive user data from analytics payloads.

## Approach

- Confirm whether the deployed bundle contains the configured PostHog env vars.
- Fix `before_send` scrubbing so it keeps PostHog's internal auth field.
- Add a regression test covering the preserved token and the existing sensitive-field scrubbing.

## Affected Areas

- `apps/ui/src/analytics/sanitize.ts`
- `apps/ui/src/analytics/__tests__/bootstrap.test.ts`

## Checklist

- [x] Verify the deployed bundle includes the configured PostHog key and host
- [x] Identify why the request payload still loses auth before reaching PostHog
- [x] Patch analytics scrubbing to preserve PostHog's internal token
- [x] Add regression coverage for the preserved token
- [x] Run targeted analytics tests
