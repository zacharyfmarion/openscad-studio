# v0.11 Surface Analytics

## Goal

Add high-signal analytics for the major user-facing workflows introduced in `v0.11.0` using the existing PostHog runtime, consent gating, and sanitization rules.

## Approach

- [x] Capture the implementation plan before changing code.
- [x] Extend the analytics contract with typed bounded enums for viewer, layout, customizer, and viewer-preference events.
- [x] Instrument 2D and 3D viewer workflows for tool selection, committed measurements, measurement clearing, and section-plane toggles.
- [x] Instrument customizer-first adoption flows for layout selection, customizer rendering, and customizer action clicks.
- [x] Instrument viewer settings changes for measurement unit and measurement snap preference updates.
- [x] Update analytics documentation to cover the new event inventory and privacy constraints.
- [x] Add focused tests for analytics payloads and event emission in the touched surfaces.

## Notes

- Reuse `analytics.track(...)`; do not introduce direct PostHog calls.
- Only send booleans, enums, counts, and buckets.
- Do not send code, file paths, geometry data, measurement values, parameter names, parameter values, or raw metadata.
