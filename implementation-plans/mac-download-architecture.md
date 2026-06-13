# Mac Download Architecture

## Goal

Make the web header download button choose the Apple Silicon DMG on M1/M2/M3 Macs instead of incorrectly falling back to the Intel x64 asset.

## Approach

- Move Mac release asset URL and architecture selection into a small utility.
- Prefer high-entropy browser architecture data when available so Apple Silicon can override the legacy `MacIntel` platform string.
- Keep a conservative x64 fallback for browsers that clearly report Intel without better architecture data.
- Add focused tests for Apple Silicon, Intel, and default behavior.

## Affected Areas

- `apps/ui/src/App.tsx`
- `apps/ui/src/utils/macDownload.ts`
- `apps/ui/src/utils/__tests__/macDownload.test.ts`

## Checklist

- [x] Create implementation plan record
- [x] Extract Mac download URL selection into a utility
- [x] Fix Apple Silicon detection
- [x] Add focused regression tests
- [x] Run targeted validation
