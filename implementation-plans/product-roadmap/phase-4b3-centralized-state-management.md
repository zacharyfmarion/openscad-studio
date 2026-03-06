# Phase 4B.3: Centralized State Management

## Summary

Adopt a single **`useEditorState` Zustand store** as the shared contract for `source / diagnostics / preview / workingDir / auxFiles`, and route _all_ mutations through it to eliminate ref-based threading. On **Tauri**, treat the Rust `EditorState` as authoritative via a small revisioned event protocol; on **Web**, the store remains authoritative (no backend).

## Effort Estimate

Large (3+ days)

## Action Plan

1. Audit + classify state (authoritative vs derived vs duplicated) and write a mapping table from current locations → store fields.
2. Introduce `useEditorState` (Zustand + selectors) and a tiny "controller" layer that can be driven either by Web (local) or Tauri (Rust events).
3. Refactor `useOpenScad` to be store-driven: read `code/workingDir/auxFiles` from the store; write `render.*` results back; keep render "latest-wins" with request ids.
4. Refactor `useAiAgent` to be store-driven: replace `sourceRef/workingDirRef/auxiliaryFilesRef/stlBlobUrlRef/capturePreviewRef` with store selectors + `getState()` reads; add revision gating for AI edits.
5. Migrate App.tsx incrementally: replace the stale-closure refs with store reads (`editorStore.getState()`), then peel off `useState` UI flags into `editorState.ui`.
6. Tauri sync (authoritative backend): add `revision` + `editor:state` event emission in Rust; frontend sends debounced `set_code` and listens for snapshots; WebBridge uses local no-op sync.
7. Lock in correctness/perf: unit tests for store actions + sync reducer, Playwright E2E for AI-edit + undo/redo + tab-switch render, and selector-granularity checks to avoid re-render storms.

## Current State Audit

### App.tsx (`apps/ui/src/App.tsx`)

**React state:**

- `tabs: Tab[]`, `activeTabId: string`
- `showWelcome`, `showNux`
- `showExportDialog`, `showSettingsDialog`, `settingsInitialTab`

**Derived:**

- `activeTab = tabs.find(...)`
- `workingDir = activeTab.filePath ? dirname : null`

**Refs used to avoid stale closures / thread state:**

- `aiPromptPanelRef`
- "stale closure avoidance": `activeTabRef`, `tabsRef`, `sourceRef`, `workingDirRef`, `renderOnSaveRef`, `manualRenderRef`, `updateSourceAndRenderRef`
- "flow control": `switchingRef`, `prevActiveTabIdRef`, `tabSwitchRenderTimerRef`, `checkUnsavedChangesRef`

### useOpenScad (`apps/ui/src/hooks/useOpenScad.ts`)

- `source`, `ready`
- `previewSrc`, `previewKind`
- `diagnostics`, `isRendering`, `error`
- `dimensionMode`
- `auxiliaryFiles` (+ multiple refs to reduce churn)

### useAiAgent (`apps/ui/src/hooks/useAiAgent.ts`)

Non-reactive refs used as "inputs" for tools:

- `sourceRef`, `capturePreviewRef`, `stlBlobUrlRef`, `workingDirRef`, `auxiliaryFilesRef`

### Existing "stores"

- `settingsStore.ts` (custom `useSyncExternalStore`, not Zustand)
- `apiKeyStore.ts` (custom `useSyncExternalStore`)
- `layoutStore.ts` (module global + localStorage)

### Rust backend (`apps/ui/src-tauri/src/cmd/ai_tools.rs`)

- `EditorState { current_code, diagnostics, working_dir }` (Mutexes)
- Frontend currently does _not_ call `update_editor_state`, so backend state is presently a parallel (mostly unused) copy.

## State Ownership Analysis

### Authoritative (should have exactly one "truth")

- **Tauri:** `code + workingDir (+ revision)` should be authoritative in Rust `EditorState`
- **Web:** `code + workingDir` must remain authoritative in the browser

### Derived (should not be stored twice)

- `workingDir` derived from active tab path
- `tab.isDirty` derived from `content !== savedContent`

### Duplicated (causing ref-heavy patterns today)

- `source` exists in `useOpenScad` state AND is mirrored into tabs on switch and into multiple refs
- `diagnostics/preview` live in `useOpenScad`, but are also cached into `tabs` on tab switch
- Rust `EditorState` duplicates frontend conceptual state without a real sync contract

## Proposed Zustand Store Shape

### `apps/ui/src/stores/editorState.ts`

```ts
import { createStore } from 'zustand/vanilla';
import { useStore } from 'zustand';

export type CodeOrigin = 'user' | 'ai' | 'fileload' | 'undo' | 'redo' | 'system';
export type RenderReason = 'manual' | 'idle' | 'save' | 'tab-switch' | 'ai' | 'fileload';

export interface EditorSnapshot {
  revision: number;
  code: string;
  workingDir: string | null;
  origin: CodeOrigin;
  updatedAt: number;
}

export interface EditorRenderState {
  ready: boolean;
  isRendering: boolean;
  requestId: number;
  activeRequestId: number | null;
  dimensionMode: '2d' | '3d';
  preview: {
    kind: RenderKind;
    src: string;
    stlBlobUrl: string | null;
  };
  diagnostics: Diagnostic[];
  error: string | null;
  lastRenderedRevision: number | null;
}

export interface EditorFsState {
  workingDir: string | null;
  auxiliaryFiles: Record<string, string>;
  auxiliaryFilesVersion: number;
}

export interface EditorUiState {
  showWelcome: boolean;
  showNux: boolean;
  showExportDialog: boolean;
  showSettingsDialog: boolean;
  settingsInitialTab?: SettingsSection;
}

export interface EditorSyncState {
  platform: 'tauri' | 'web';
  clientId: string;
  hydrated: boolean;
  revision: number;
  inFlightRevision: number | null;
}

export interface EditorStateStore {
  doc: {
    code: string;
    revision: number;
    origin: CodeOrigin;
    updatedAt: number;
  };
  fs: EditorFsState;
  render: EditorRenderState;
  ui: EditorUiState;
  sync: EditorSyncState;
  actions: {
    setCode(code: string, meta?: { origin?: CodeOrigin; optimistic?: boolean }): void;
    applyExactReplace(input: {
      oldString: string;
      newString: string;
      rationale?: string;
      expectedRevision?: number;
    }): { ok: true } | { ok: false; error: string };
    setWorkingDir(dir: string | null): void;
    setAuxiliaryFiles(files: Record<string, string>): void;
    requestRender(reason: RenderReason): number;
    setRenderStarted(requestId: number): void;
    setRenderFinished(input: {
      requestId: number;
      renderedRevision: number;
      kind: RenderKind;
      src: string;
      stlBlobUrl: string | null;
      diagnostics: Diagnostic[];
      error: string | null;
      dimensionMode: '2d' | '3d';
    }): void;
    hydrateFromBackend(snapshot: EditorSnapshot): void;
    ackBackend(revision: number): void;
    setUi(partial: Partial<EditorUiState>): void;
  };
}

// Selectors
export const selectCode = (s: EditorStateStore) => s.doc.code;
export const selectDiagnostics = (s: EditorStateStore) => s.render.diagnostics;
export const selectPreview = (s: EditorStateStore) => s.render.preview;
export const selectWorkingDir = (s: EditorStateStore) => s.fs.workingDir;
export const selectAuxFilesVersion = (s: EditorStateStore) => s.fs.auxiliaryFilesVersion;
```

### Exact Mapping (current → store)

- `useOpenScad.source` → `editorStore.doc.code`
- `useOpenScad.diagnostics` → `editorStore.render.diagnostics`
- `useOpenScad.previewSrc/previewKind` → `editorStore.render.preview.{src,kind}`
- `useOpenScad.dimensionMode/isRendering/error/ready` → `editorStore.render.*`
- `useOpenScad.auxiliaryFiles` → `editorStore.fs.auxiliaryFiles` (+ version)
- `App.tsx workingDir` → `editorStore.fs.workingDir`
- `App.tsx showWelcome/showNux/showExportDialog/showSettingsDialog` → `editorStore.ui.*`
- `useAiAgent sourceRef/workingDirRef/auxiliaryFilesRef/stlBlobUrlRef` → store selectors

## Migration Strategy

### Phase A (safe coexistence)

- Keep `WorkspaceContext` but build its value from selectors
- Replace event listeners' ref reads with `editorStore.getState()` one-by-one, then delete refs

### Phase B (unbundle)

- Convert panels to read from `useEditorState(selectX)` directly
- Delete `WorkspaceContext` entirely

### Phase C (optional, after 4B.3)

- Move tabs into `tabsStore` (separate)
- Store per-tab render cache there instead of in `Tab` objects

## Backend ↔ Frontend Sync

### Tauri Protocol (minimal, revisioned)

**Rust additions:**

- Add `revision: Mutex<u64>` and update on any authoritative change
- Emit `editor:state` event on `set_code`, `update_working_dir`, history restore

**Frontend:**

- On mount (Tauri only), `listen('editor:state', ...)` → `editorStore.actions.hydrateFromBackend(snapshot)`
- On user typing: update store immediately (optimistic), debounce IPC `set_code({ code, clientId, baseRevision })`
- On ack/snapshot: reconcile by trusting backend revision

### Web Mode

- No IPC; store is authoritative; render/AI operate directly against it

## Impact on Existing Hooks

### `useOpenScad`

Change from "owns source + render outputs" → "render controller"

- Input selectors: `doc.code`, `fs.workingDir`, `fs.auxiliaryFilesVersion`
- Output actions: `setRenderStarted`, `setRenderFinished`, `render.ready` updates

### `useAiAgent`

- Replace `updateSourceRef/updateWorkingDir/updateAuxiliaryFiles/updateStlBlobUrl` with direct store reads
- `apply_edit` tool calls `editorStore.actions.applyExactReplace()`

### `useHistory`

- Keep `historyService` as-is, but make `undo/redo/restore` call `editorStore.actions.setCode(code, { origin: 'undo'|'redo' })` and `requestRender('undo')`

## Component Impact (props → selectors)

- `EditorPanel`: use `useEditorState(selectCode)` + `useEditorState(selectDiagnostics)` + `editorStore.actions.setCode`
- `PreviewPanel`: use `selectPreview` + `render.isRendering` + `render.error`
- `CustomizerPanelWrapper`: use `selectCode` and call `setCode`
- `AiChatPanel`: tools read editor state from the store (not refs)

## Platform Abstraction

- Keep `PlatformBridge` for filesystem/menu/window concerns as-is
- Add a separate `editorSync` module:
  - Tauri: uses `@tauri-apps/api/event.listen` + `invoke('set_code'|...)`
  - Web: no-op (marks `sync.hydrated=true`)

## Error Handling

- Store-level invariants:
  - "latest-wins" render: ignore `setRenderFinished` if requestId isn't active
  - AI edit gating: reject `applyExactReplace` if `expectedRevision` mismatches
- Sync-level invariants (Tauri):
  - Backend snapshot revision < store revision: overwrite store with backend (authoritative)
  - Backend snapshot revision > store revision: fast-forward store

## Testing Strategy

- **Unit (Jest):** `applyExactReplace` uniqueness/line-limit/revision-gate; render latest-wins; hydrate/ack reconciliation
- **E2E (Playwright):** AI `apply_edit` updates editor + triggers render; undo/redo after AI edit; rapid tab switching; typing while AI streams

## Edge Cases

- **AI edits while user types:** require `expectedRevision` match; otherwise tool returns "out of date, retry"
- **Undo across render transitions:** undo should bump render requestId so prior in-flight render can't overwrite
- **Tab switch with pending render:** cancel by requestId (latest-wins)

## Performance

- Use narrow selectors everywhere (`selectCode`, `selectPreview`, `selectDiagnostics`) — never subscribe to the full store
- Keep `auxiliaryFiles` updates rare; use `auxiliaryFilesVersion` for cheap dependency tracking
- Avoid storing unstable DOM callbacks in shared state

## Watch Out For

- Blob URLs are frontend-only; don't make Rust "authoritative" for `preview.src`
- If `Editor` is controlled (`value={code}`), ensure backend snapshots don't cause cursor jumps; reconcile via Monaco APIs
- Centralize `code-updated` listener (store/controller) to avoid double-applies
