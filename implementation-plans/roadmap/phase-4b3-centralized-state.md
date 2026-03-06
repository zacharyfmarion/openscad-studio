# Centralized State Management Plan — OpenSCAD Studio

## 1) Overview

### Current-state problems

- **State scattered across paradigms**: `useRef` "state" in `App.tsx`, `useState`, `localStorage`, and at least one Zustand store (`settingsStore`).
- **Non-reactive refs**: refs in `App.tsx` (source/diagnostics/preview/tab state) are hard to subscribe to, easy to desync.
- **Duplicated editor truth** (desktop): Rust backend `EditorState` mirrors frontend state, causing sync complexity.
- **Hook-level silos**: `useOpenScad` and `useAiAgent` manage critical state privately.

### Target architecture

- **Frontend is the single source of truth** for all state on both platforms via focused Zustand stores.
- **Backend becomes "capability provider"** (API keys, filesystem, persistence), not state holder.
- **Event-based integration** via `PlatformBridge` for persistence + desktop IPC.

---

## 2) State Audit

| Category | Includes                                  | Current Location          | Target Store           |
| -------- | ----------------------------------------- | ------------------------- | ---------------------- |
| Editor   | source text, cursor, selections, undo     | App.tsx refs, Monaco      | `editorStore`          |
| Tabs     | open tabs, active tab, ordering           | App.tsx refs              | `tabsStore`            |
| Render   | preview URL, status, diagnostics, cache   | useOpenScad, App.tsx refs | `renderStore`          |
| AI       | conversations, messages, streaming, tools | useAiAgent                | `aiStore`              |
| UI       | panel layout, theme, ephemeral flags      | useState + localStorage   | `uiStore`              |
| File     | paths, dirty flags, recents               | scattered                 | `fileStore`            |
| Settings | theme, AI model, render prefs             | settingsStore             | `settingsStore` (keep) |

---

## 3) Store Design (Zustand)

### 3.1 `settingsStore` (existing, keep)

User-configurable settings: theme, AI provider/model, render quality, feature flags.

### 3.2 `editorStore`

- **State**: `docsById: Record<DocId, EditorDoc>` with `source`, `revision`, `cursor`, `origin`
- **Actions**: `createDoc`, `setDocSource(docId, source, meta)`, `applyExactReplace(docId, old, new, meta)`, `setCursor`, `deleteDoc`
- **Key feature**: `expectedRevision` gating for race-safe AI edits
- **Persistence**: Session-only (memory); bounded snapshot for tab restore

### 3.3 `tabsStore`

- **State**: `tabs: Tab[]`, `activeTabId: TabId | null`
- **Actions**: `openTab`, `closeTab`, `setActiveTab`, `reorderTabs`, `updateTab`
- **Persistence**: Persist tab session for restart restore

### 3.4 `renderStore`

- **State**: `jobsByDocId`, `cache`, `activeJobIdByDocId`
- **Actions**: `requestRender(docId, reason)`, `cancelRender(docId)`, `clearPreview(docId)`
- **Key feature**: "latest-wins" per doc, completion verifies jobId still current
- **Persistence**: Session-only (memory)

### 3.5 `aiStore`

- **State**: `conversationsById`, `activeConversationId`
- **Actions**: `startConversation`, `setActiveConversation`, `appendMessage`, `setStreamingStatus`, `upsertToolCall`
- **Persistence**: Optional (user setting); desktop via backend, web via localStorage

### 3.6 `uiStore`

- **State**: `layout` (panel visibility, split sizes), `toasts`
- **Persistence**: Persist layout + panel states

### 3.7 `fileStore`

- **State**: `filesById: Record<FileId, FileRecord>`, `recent`, `io`
- **Actions**: `attachFileToDoc`, `markSaved`, `setDirtyByDoc`, `addRecent`
- **Persistence**: Persist recents + last session file list

### Cross-store coordination

Thin orchestrator modules (`state/orchestrators/*.ts`) that read from stores via `getState()` and trigger multi-step flows.

---

## 4) Backend Sync Strategy

### Recommendation: Frontend is source of truth (both platforms)

- Rendering is openscad-wasm on frontend; no advantage to Rust state.
- Web has no backend; split architecture would be forced otherwise.

### Eliminating Rust EditorState

1. Stop treating Rust `EditorState` as authoritative.
2. AI tools operate on data passed from frontend, not stored editor state.
3. Remove `get_current_code` / `apply_edit` that read/mutate Rust state; replace with request-scoped snapshots.

### Event-based sync protocol (desktop)

- **Frontend → Backend**: `ai.startStream({ conversationId, messages, context })`
- **Backend → Frontend**: `ai.streamDelta`, `ai.toolRequest`, `ai.done`, `ai.error`
- **Preferred tool model**: Backend emits proposed edit payload; frontend applies via `editorStore.applyExactReplace`.

---

## 5) Migration Plan

### Extraction order

1. **Tabs + Editor docs** first (removes App.tsx refs for source/tab state)
2. **Render store** (refactor `useOpenScad` into store actions)
3. **File store** (dirty flags + recents + open/save)
4. **AI store** (lift `useAiAgent` state into store)
5. **UI store** last (layout persistence)

### Co-existence strategy

- Introduce stores but keep old refs temporarily.
- Bridge helpers: `useRefBridge(ref, selector)` for legacy consumers.
- Replace one consumer/mutator at a time; delete ref only after all reads/writes removed.

---

## 6) UX Considerations

### State persistence across refresh/restart

- Persist: settings, layout, recent files, tab session
- Bounded restoration: max 10 docs, max 200KB per doc
- On startup: restore tabs, mark "recovered", prompt to save

### Undo/redo

- Keep editor-library undo for typing.
- Store-level "transactions" for AI edits, file load, format → single editor transaction so one undo reverts it.

---

## 7) Performance

- **Narrow selectors**: `useEditorStore(s => s.docsById[docId]?.source)`
- **Split stores by domain** to reduce update blast radius
- **Large string isolation**: only editor component subscribes to `source`
- **Derived state**: compute in actions (on `setDocSource`) with debounce

---

## 8) Edge Cases

- **Render during tab switch**: "latest-wins" per doc; completion verifies jobId
- **AI edits while typing**: `expectedRevision` gating; show "AI edit out of date; retry"
- **Multiple tabs same file**: Single-tab-per-file policy (focus existing tab)

---

## 9) Error Handling

### Invariants + recovery

- `activeTabId` must exist in `tabs`
- Each `tab.docId` must exist in `editorStore.docsById`
- Missing doc → create placeholder with "recovery error" banner

---

## 10) Testing Strategy

- **Unit tests**: Each store's actions as pure state transitions (zustand/vanilla)
- **Integration tests**: "Switch tab while autoRender" cancels old render; "AI applies edit" updates correctly
- **Platform parity**: Shared test suite against web/desktop PlatformBridge mocks

**Effort estimate:** Medium (1–2 days) for stores + migration; Large (3d+) to also remove Rust EditorState coupling.
