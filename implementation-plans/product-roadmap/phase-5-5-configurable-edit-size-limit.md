# Phase 5.5: Configurable Edit Size Limit

## Summary

Make `maxEditLines` a persisted AI setting (default 120) and have both validators (Rust desktop + TS web) read the same value (with clamping + fallback), then inject it into the system prompt each request so the model naturally stays within bounds.

## Effort Estimate

Medium (1–2 days)

## Action Plan

1. Add `ai.maxEditLines` to `settingsStore.ts` with default `120`, persist, clamp on load/write.
2. Add control in `SettingsDialog.tsx` → AI tab: segmented control with `120 | 250 | 500`.
3. Web: update Vercel AI SDK tool validator to read from `settingsStore.getState().ai.maxEditLines`.
4. Desktop: persist to backend-readable store, make `ai_tools.rs::validate_edit()` read it (fallback 120).
5. Update system prompt construction to include current limit dynamically.
6. Unify validation semantics across Rust + TS.
7. Add tests: unit tests for clamping/validation + E2E flow.

## UI Design

- Segmented control / radio group with 3 options: `120 (Recommended)`, `250`, `500 (Advanced)`
- Help text: "Higher limits allow larger refactors but increase chance of accidental large changes."

## Range Constraints

- Min 50, Max 500
- Too low (<50): makes meaningful refactors impossible
- Too high (>500): increases risk of unintended rewrites, slower validation

## Desktop Implementation

- Frontend writes setting via Tauri command (e.g., `set_settings_partial`)
- Rust stores in app state (`RwLock<Settings>`)
- `validate_edit()` reads from Rust settings state, NOT from tool input

## System Prompt

- Include: "Edits must change ≤ N lines; larger edits will be rejected."
- Updated per request so setting changes take effect immediately

## Edge Cases

- Changing setting mid-conversation: enforced on next tool call
- Multi-file edits: limit is per `apply_edit` call
- Invalid/corrupted stored value: clamp to default 120
