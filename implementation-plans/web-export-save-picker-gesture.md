# Web Export Save Picker Gesture

## Goal

Fix web export failures caused by `showSaveFilePicker()` and make exports behave like normal browser downloads that appear in Chrome's download UI.

## Approach

1. Replace the web export path with the existing blob-download flow instead of `showSaveFilePicker()`.
2. Keep desktop export behavior unchanged so native save dialogs still work in Tauri.
3. Add regression tests that assert web exports trigger the browser download path and never open the save picker.
4. Run targeted validation and record the results in this plan and the PR handoff.

## Affected Areas

- `apps/ui/src/platform/webBridge.ts`
- `apps/ui/src/platform/__tests__/webBridge.test.ts`
- `implementation-plans/web-export-save-picker-gesture.md`

## Checklist

- [x] Confirm the Sentry failure mode and identify the async gap before `showSaveFilePicker()`
- [x] Replace the web export picker path with browser-download behavior
- [x] Add regression coverage for the web download behavior
- [x] Run targeted tests and shared validation
- [x] Create a draft PR against `main` with validation notes
- [x] Wait for preview status and report the PR plus preview URL
