# Analytics AI Privacy Hardening

## Goal

Ensure AI conversations are not captured by analytics and document the analytics contract in the repo.

## Approach

- Exclude the full AI chat surface and welcome AI entry area from PostHog autocapture.
- Strengthen analytics scrubbing so conversation-like freeform properties are removed before send.
- Add repo documentation describing what the app does and does not track.

## Checklist

- [x] Review existing AI analytics and autocapture exclusions
- [x] Harden AI surface exclusions and property scrubbing
- [x] Add analytics documentation under `docs/`
- [x] Add focused tests for the tighter guarantees
- [x] Run targeted verification
