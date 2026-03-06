# Platform Abstraction Refinement — Implementation Plan

## Overview

Keep the platform layer in `apps/ui/src/platform/` for now, but tighten the contract and selection mechanism: make the `PlatformBridge` interface complete (remove hidden methods like `setDirtyState`) and implement build-time selection via `VITE_PLATFORM` with a runtime fallback.

**Effort estimate:** Medium (1–2 days) for refinement; Large (3d+) if moving to `packages/platform/`.

---

## 1) Current State vs Desired State

### Current state (confirmed from codebase)

- Platform abstraction exists in `apps/ui/src/platform/`: `types.ts`, `tauriBridge.ts`, `webBridge.ts`, `index.ts`
- `@tauri-apps/*` imports confined to `tauriBridge.ts` only (no leakage)
- Runtime platform selection via `('__TAURI_INTERNALS__' in window)` + dynamic import
- `apps/ui/src/api/tauri.ts` already deleted (cleanup complete)
- `WebBridge` has `setDirtyState()` not in `PlatformBridge` interface (duck-typed)

### Desired state

- Single explicit platform seam: no imports outside bridge files, no duck-typing
- Deterministic build-time selection via `VITE_PLATFORM` to ensure web build excludes Tauri code
- Complete `PlatformBridge` interface matching actual usage

---

## 2) Gap Analysis

### Already done

- Bridge pattern implemented with TauriBridge + WebBridge
- No platform-specific imports leak into shared components
- Direct Tauri invoke/listen usage fully isolated
- `api/tauri.ts` already deleted

### Missing

- `packages/platform/` not created (only `packages/shared/` exists)
- Build-time `VITE_PLATFORM` not implemented in code/scripts
- Interface drift: `WebBridge.setDirtyState()` exists but isn't in `PlatformBridge`
- `WebBridge.setWindowTitle()` ignores its argument (sets constant)

---

## 3) Decision: `packages/` vs `apps/ui/src/platform/`

### Recommendation: Keep `apps/ui/src/platform/` (for now)

**Pros of keeping current location:**

- Minimal disruption; web app already consumes via `@ui` alias
- Lowest migration risk (fewer config changes)
- Fits current sharing strategy

**Cons:**

- Weaker boundary enforcement
- Harder to reuse outside UI app

**When to escalate to `packages/platform/`:**

- Need to reuse outside UI app (another frontend, test harness, mobile)
- Want CI-enforced import boundaries
- Web bundle size becomes priority requiring guaranteed Tauri exclusion

---

## 4) Remaining Tauri Coupling

All `@tauri-apps/*` imports are in `tauriBridge.ts`:

- `@tauri-apps/plugin-dialog` (open/save/confirm/ask)
- `@tauri-apps/plugin-fs` (readTextFile/writeTextFile/writeFile/readDir/exists)
- `@tauri-apps/api/window` (setTitle, close-request handling)
- `@tauri-apps/api/event` (menu event listening)
- `@tauri-apps/api/path` (homeDir/join)

**Strategy:** Keep all imports in `tauriBridge.ts`. Add explicit rule: "No `@tauri-apps/*` imports outside `platform/tauriBridge.ts`."

---

## 5) Interface Completeness

### Fixes needed

- Add `setDirtyState?(dirty: boolean): void` to `PlatformBridge` (optional member)
- Fix `WebBridge.setWindowTitle()` to actually set `document.title = title`
- Keep `PlatformCapabilities.hasFileSystem` meaning "full disk access" (Tauri only)
- Do NOT introduce a "Platform services" façade — current bridge-only model is sufficient

---

## 6) UX Considerations

Zero user-visible changes. Verify:

- File open/save/export flows work identically on both targets
- Menu/keyboard actions route correctly
- Close confirmation (desktop: intercept, web: beforeunload) unchanged

---

## 7) Migration Steps

1. **Baseline audit**: Capture current platform surface usage and expected behaviors
2. **Normalize PlatformBridge contract**: Add `setDirtyState?` to types.ts; update App.tsx to use optional chaining
3. **Fix WebBridge behavior**: Implement `setWindowTitle` properly
4. **Implement build-time selection**: Prefer `import.meta.env.VITE_PLATFORM` when present, fallback to runtime detection
5. **Wire VITE_PLATFORM into build**: `apps/web` builds with `VITE_PLATFORM=web`, `apps/ui` (tauri) with `VITE_PLATFORM=tauri`
6. **Guard against leakage**: Document rule in ARCHITECTURE.md; optionally add ESLint restriction
7. **Cross-target verification**: Validate both platforms against baseline checklist

---

## 8) Testing Strategy

### Automated

- `pnpm web:build` succeeds without Tauri imports
- `pnpm tauri:build` (or `tauri:dev`) compiles and runs
- Type checks pass after interface changes

### Manual smoke checklist (both platforms)

1. Open a .scad file → editor updates → renders
2. Save and Save As → filename/title updates → dirty clears
3. Export STL/SVG/DXF → download/save works
4. Menu actions fire correctly (native menu on desktop, web menu bar on web)
5. Dirty close handling → warnings appear as expected
