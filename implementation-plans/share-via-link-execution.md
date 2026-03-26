# Share Via Link Execution Plan

## Goal

Implement the web share flow described in `implementation-plans/product-roadmap/phase-10-1-share-via-link-implementation.md` with staged checkpoints that are easy to verify manually and through automated tests.

## Approach

1. Land the deployment and API contract foundation first so Pages Functions can actually ship.
2. Add share creation in the web UI with secure one-time thumbnail upload.
3. Add shared-link loading with transient layout override and onboarding bypass.
4. Add targeted automated coverage and run focused verification after each stage.

## Affected Areas

- `apps/web/functions/**`
- `apps/web/wrangler.toml`
- `.github/workflows/deploy-web.yml`
- `apps/web/src/main.tsx`
- `apps/web/index.html`
- `apps/ui/src/App.tsx`
- `apps/ui/src/components/WebMenuBar.tsx`
- `apps/ui/src/components/ShareDialog.tsx`
- `apps/ui/src/components/ShareBanner.tsx`
- `apps/ui/src/services/shareService.ts`
- `apps/ui/src/hooks/useShareLoader.ts`
- tests in `apps/ui/src/**` and `e2e/**`

## Checklist

- [x] Create an execution plan with staged checkpoints
- [x] Implement Pages Functions deployment/config updates and share API foundations
- [x] Implement share creation UI and secure thumbnail upload flow
- [x] Implement shared-link loading, welcome/NUX bypass, and transient share layout
- [x] Add or update unit/E2E coverage
- [x] Run targeted verification and note any remaining manual checks

## Remaining Manual Checks

- Confirm Cloudflare Pages project bindings exist for `SHARE_KV` and `SHARE_R2` in the real deployment environment.
- Deploy from CI once to verify Pages Functions are uploaded from `apps/web` and the `/api/share/*` plus `/s/*` routes resolve in production.
- Paste a real shared link into Discord/Twitter/other card validators to confirm OG tags and thumbnail delivery through Cloudflare.
