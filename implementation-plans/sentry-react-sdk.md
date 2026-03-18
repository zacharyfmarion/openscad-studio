# Sentry React SDK Setup

## Goal

Add privacy-conscious Sentry error monitoring to the shared React application used by the desktop and web builds, following the Sentry React SDK skill guidance for React 18 + Vite.

## Approach

- Add a shared Sentry bootstrap sidecar in `apps/ui/src` that initializes error monitoring before the app loads.
- Import the Sentry sidecar first in both React entrypoints so initialization happens before application code.
- Extend Vite config and env typing to support DSN/release values and optional source map upload configuration.
- Scrub sensitive metadata before events are sent so AI API keys and similar secrets are not reported.
- Verify the app still type-checks and builds.

## Affected Files

- `apps/ui/package.json`
- `apps/web/package.json`
- `apps/ui/src/main.tsx`
- `apps/web/src/main.tsx`
- `apps/ui/src/vite-env.d.ts`
- `apps/web/src/vite-env.d.ts`
- `apps/ui/vite.config.ts`
- `apps/web/vite.config.ts`
- `apps/ui/src/sentry.ts`

## Checklist

- [x] Inspect the existing React/Vite setup and confirm the right Sentry integration path.
- [x] Add shared Sentry initialization for React 18 + Vite.
- [x] Wire the Sentry bootstrap into both entrypoints and Vite configs.
- [x] Validate with type-check/build and summarize any follow-up env setup needed.
