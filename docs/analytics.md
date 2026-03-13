# Analytics in OpenSCAD Studio

This document describes what OpenSCAD Studio tracks in the product app, what it does not track, and the safeguards around analytics collection.

## Scope

- Product analytics apply to the shared app used by the web app and the Tauri desktop app.
- The marketing/docs site currently uses Plausible separately and is not part of the in-app PostHog event stream.
- Analytics are anonymous in v1. The app does not call `identify()` with a user account.

## What We Track

The app uses PostHog with:

- a persistent anonymous identifier on the current browser/profile or desktop webview storage
- autocapture for general product interactions
- custom product events for high-signal milestones such as:
  - `app opened`
  - `workspace layout selected`
  - `settings opened`
  - `analytics preference changed`
  - `ai panel opened`
  - `conversation started`
  - `api key saved`
  - `api key cleared`
  - `attachment added`
  - `attachment removed`
  - `ai settings opened`
  - `model selected`
  - `file opened`
  - `file saved`
  - `file exported`
  - `render completed`
  - `ai request submitted`
  - `ai request completed`
  - `ai request cancelled`
  - `checkpoint restored`
  - `app error`

Custom AI events are intentionally limited to metadata such as:

- provider and model id
- attachment counts
- selected/ready/error attachment counts
- duration
- tool call counts and tool names
- prompt-length buckets
- conversation-length buckets
- finish/error flags
- booleans describing whether a conversation or draft already existed

They do not include raw prompt text, transcript text, image contents, or attachment contents.

## What We Do Not Intentionally Track

The app is designed not to send the following to product analytics:

- OpenSCAD code
- AI prompt text
- AI conversation transcripts
- AI attachment contents or filenames
- API keys
- diagnostics text
- raw stack traces
- absolute file paths
- session recordings or replay data

## Safeguards

Several overlapping safeguards are in place:

- Session recording is disabled.
- Global masking is enabled for text and element attributes.
- A `before_send` scrubber removes sensitive-looking properties before events are sent.
- The AI chat surface is excluded from autocapture with `ph-no-capture`.
- The welcome-screen AI entry area is excluded from autocapture with `ph-no-capture`.
- The editor, diagnostics panel, and API key settings are also excluded from autocapture.
- API-key-related custom events only include the provider name, never the key itself.

## Consent and Storage

- Analytics are enabled by default today and can be turned off in Settings > Privacy.
- Turning analytics off stops future capture on the current browser/profile or installed desktop app profile.
- Turning analytics off does not delete data already collected.
- The preference is stored locally and is not account-synced.

## Maintenance Notes

When adding new analytics events or UI surfaces:

- never include freeform prompt, transcript, code, path, or key material in event properties
- prefer counts, enums, booleans, and bounded buckets
- add `ph-no-capture` to any new AI conversation or secret-entry surface
- update this document if the analytics contract changes
