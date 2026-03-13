# PostHog Analytics Implementation

## Goal

Add PostHog analytics to the shared OpenSCAD Studio app using the official React integration pattern, with persistent anonymous journeys, autocapture enabled, no session recording, and custom high-signal product events for AI, render, file, and settings flows.

## Approach

- Add `posthog-js` and `@posthog/react` to the shared UI and web app packages.
- Initialize PostHog only in the two root entrypoints and wrap the app with `PostHogProvider`.
- Build a shared analytics layer on top of `usePostHog()` for custom events, consent handling, and error capture.
- Add a privacy settings section with an analytics opt-out toggle.
- Instrument bootstrap, app, AI, render, file, and settings flows.
- Add event scrubbing and sensitive-surface capture exclusions.
- Add focused tests for scrubbing, consent, and analytics runtime behavior.

## Affected Areas

- `apps/ui/src/main.tsx`
- `apps/web/src/main.tsx`
- `apps/ui/src/stores/settingsStore.ts`
- `apps/ui/src/components/SettingsDialog.tsx`
- `apps/ui/src/App.tsx`
- `apps/ui/src/hooks/useOpenScad.ts`
- `apps/ui/src/hooks/useAiAgent.ts`
- `apps/ui/src/utils/notifications.ts`
- new shared analytics files under `apps/ui/src/analytics/`

## Checklist

- [x] Add package dependencies and environment typing
- [x] Create shared analytics bootstrap/runtime helpers
- [x] Wrap both entrypoints with `PostHogProvider`
- [x] Add privacy settings and analytics opt-out handling
- [x] Instrument app-level events and error capture
- [x] Instrument render, AI, and file lifecycle events
- [x] Add autocapture exclusions for sensitive UI surfaces
- [x] Add analytics-focused tests
- [x] Run targeted verification and update this plan with completion status
