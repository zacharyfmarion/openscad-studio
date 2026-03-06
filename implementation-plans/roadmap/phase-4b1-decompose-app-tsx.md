# OpenSCAD Studio — App.tsx Decomposition Plan (1189 → <300 LOC)

## 1) Overview

This refactor moves "business logic + event wiring" out of `App.tsx` into focused hooks and a small set of Zustand stores, leaving `App.tsx` as a thin composition layer (layout + providers + hook wiring). The outcome is improved maintainability (single-responsibility modules), fewer UI regressions (centralized state + deterministic side effects), and removal of the current "refs-as-state" anti-pattern that makes behavior implicit and hard to test.

**Target:** `App.tsx` becomes an app shell under ~300 lines; behavior lives in:

- `hooks/` (orchestration + side effects)
- `stores/` (reactive state)
- `components/` (layout composition)

---

## 2) Hooks to Extract

### Shared foundation (do first): minimal stores + types

Before extracting hooks, define a stable "contract" for documents/tabs/commands so hooks can interoperate without circular dependencies.

**New/expanded Zustand stores (minimal set):**

- `documentStore` (source of truth for open docs + dirty state)
- `tabStore` (UI tab ordering + active tab id; optionally derived from `documentStore` if you want one source of truth)
- `uiStore` (focus, layout/panels state, ephemeral UI flags)
- `notificationStore` (toasts/errors surfaced consistently; if one exists, reuse)

**Core types (example):**

```ts
type DocumentId = string;

type DocumentModel = {
  id: DocumentId;
  uri: string; // file path or virtual uri
  title: string;
  language: 'openscad' | string;
  dirty: boolean;
  lastSavedAt?: number;
  // optional: versioning for Monaco integration
};

type AppError = {
  scope: 'file' | 'tabs' | 'menu' | 'shortcuts' | 'ipc';
  message: string;
  cause?: unknown;
  recoverable?: boolean;
};
```

**Principle:** _Documents are "data"; tabs are "view/UI"._ File operations should not depend on Dockview or Monaco; UI reflects store state.

---

### A) `useFileManager`

#### Exact responsibilities

- Open/create documents (from disk via `PlatformBridge` or "new file" templates).
- Save / Save As / Save All.
- Track and update dirty state (from Monaco/editor change events).
- Resolve canonical URIs, recent files, and per-document metadata (title, last opened).
- Provide "close document" flow (including dirty confirmation), but **not** the UI modal itself—only returns intent/flags.

#### State it owns

- Prefer Zustand (`documentStore`) for all reactive state:
  - `documentsById: Record<DocumentId, DocumentModel>`
  - `activeDocumentId: DocumentId | null`
  - `recentUris: string[]`
  - `pendingSaveById: Record<DocumentId, boolean>` (optional)
- Hook-local state only for ephemeral async orchestration:
  - `isBusy` (aggregate boolean) _or_ derived from store
  - `lastError: AppError | null`
  - `abortControllers` stored in refs for in-flight operations (not reactive)

#### Functions it exposes (suggested API)

```ts
type UseFileManager = {
  activeDocumentId: DocumentId | null;
  documents: DocumentModel[];

  openFile: (uri?: string) => Promise<DocumentId | null>; // if uri undefined -> file picker
  openFiles: (uris: string[]) => Promise<DocumentId[]>;

  newFile: (opts?: { title?: string; template?: string }) => DocumentId;
  saveFile: (id?: DocumentId) => Promise<boolean>;
  saveFileAs: (id?: DocumentId) => Promise<boolean>;
  saveAll: () => Promise<{ ok: number; failed: number }>;

  closeFile: (id: DocumentId) => Promise<'closed' | 'cancelled'>;
  closeAll: (opts?: { exceptId?: DocumentId }) => Promise<void>;

  setDirty: (id: DocumentId, dirty: boolean) => void;
  renameTitle: (id: DocumentId, title: string) => void;

  lastError: AppError | null;
};
```

#### Dependencies on other hooks/stores

- **Depends on:** `PlatformBridge` (TauriBridge/WebBridge), `documentStore`, `notificationStore`, optionally `settingsStore` (e.g., autosave, default folders).
- **Does not depend on:** Dockview, tab hook, menu hook, shortcuts hook.

#### Eliminating refs-as-state

| Current ref used as state               | Replace with                                                                                                                        |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `activeFileRef.current`                 | `documentStore.activeDocumentId`                                                                                                    |
| `openFilesRef.current` / arrays in refs | `documentStore.documentsById` + ordered list selector                                                                               |
| `dirtyMapRef.current`                   | `documentStore.documentsById[id].dirty`                                                                                             |
| "currently saving" ref                  | `pendingSaveById` in store _or_ hook-local `inFlightSaves` map in a ref **plus** a reactive `isSaving` derived value if UI needs it |
| "last opened path" ref                  | `settingsStore.lastOpenedDir` or `uiStore.lastDialogDir`                                                                            |

**Rule:** use refs only for non-reactive instances (AbortController, cached promises). If the UI conditionally renders based on it, it belongs in Zustand (or hook state).

---

### B) `useTabManager`

#### Exact responsibilities

- Own Dockview integration: create/update/remove panels based on store state.
- Handle tab activation, reorder, close requests, and selection syncing.
- Provide "tab → document" mapping (panel id = `DocumentId` recommended).
- Handle focus restoration (e.g., switching tabs returns focus to Monaco).

#### State it owns

- **Dockview imperative instance** is a ref (not state):
  - `dockviewApiRef: React.RefObject<DockviewApi | null>`
- Reactive state should be in `tabStore` (or derived from `documentStore`):
  - `tabOrder: DocumentId[]`
  - `activeTabId: DocumentId | null` (prefer same as `activeDocumentId` to avoid divergence)
  - `panelLayoutState` (optional persisted layout in `uiStore`)

Hook-local state:

- `lastError: AppError | null`

#### Functions it exposes (suggested API)

```ts
type UseTabManager = {
  bindDockview: (api: DockviewApi) => void; // called once from Dockview onReady
  activeTabId: DocumentId | null;
  tabOrder: DocumentId[];

  setActiveTab: (id: DocumentId) => void;
  moveTab: (id: DocumentId, toIndex: number) => void;
  requestCloseTab: (id: DocumentId) => Promise<void>; // delegates to fileManager.closeFile
  revealTab: (id: DocumentId) => void; // ensure panel exists + activate
};
```

#### Dependencies on other hooks/stores

- **Depends on:** `documentStore` (documents list + active id), `tabStore`/`uiStore`, `useFileManager` (for close flow), and optionally `uiStore` (focus management).
- **Does not depend on:** menu/shortcuts directly.

#### Eliminating refs-as-state

| Current ref used as state                 | Replace with                                                                                                                   |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `dockviewApiRef` used to infer active tab | active tab is `documentStore.activeDocumentId` (source of truth); Dockview is just a renderer                                  |
| `panelsRef.current` map                   | compute panels from `documentsById` + `tabOrder`; keep a non-reactive cache ref only to avoid re-creating panels unnecessarily |
| "selected tab index" ref                  | `tabStore.tabOrder` + `activeTabId`                                                                                            |

**Key invariant:** never "read the truth" from Dockview events without writing it into store. Dockview emits events → you dispatch actions; store changes → you update Dockview.

---

### C) `useMenuListeners`

#### Exact responsibilities

- Subscribe/unsubscribe to platform menu events (Tauri menu + custom events; web equivalents via bridge).
- Translate menu events into command invocations (open, save, close tab, toggle panels, etc.).
- Ensure listeners are stable across re-renders and always cleaned up on unmount.

#### State it owns

- No global state; minimal hook-local:
  - `lastError: AppError | null`
- Listener disposers stored in refs:
  - `unlistenFnsRef: Array<() => void>`

#### Functions it exposes

```ts
type UseMenuListeners = {
  lastError: AppError | null;
};
```

#### Dependencies on other hooks/stores

- **Depends on:** `PlatformBridge` event APIs, `useFileManager`, `useTabManager`, `settingsStore/uiStore` for toggles.
- **Recommended:** route menu actions through a single "command layer" (can be inside this hook initially) so shortcuts and menu share the same functions.

#### Eliminating refs-as-state

| Current ref used as state                                | Replace with                                                                                       |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| "latest handlers" stored in refs to avoid stale closures | Use stable actions from Zustand (`store.getState().actions`) or `useCallback` with store selectors |
| "is mounted" ref guard                                   | Prefer AbortController + cleanup via unlisten; if async, check `signal.aborted`                    |

---

### D) `useKeyboardShortcuts`

#### Exact responsibilities

- Register global shortcuts (window-level) and editor-context shortcuts (Monaco-level) without duplicating logic.
- Prevent conflicts (e.g., ignore when input fields focused; respect platform conventions).
- Route shortcuts into the same command functions used by menu events.

#### State it owns

- No global state; minimal hook-local:
  - `lastError: AppError | null`
- Refs:
  - `monacoEditorRef` should _not_ live in `App.tsx` as "state"; instead expose a binder:
    - `bindEditor(editorInstance)` stored in `uiStore` or within a dedicated `editorStore`

#### Functions it exposes

```ts
type UseKeyboardShortcuts = {
  bindMonaco: (editor: monaco.editor.IStandaloneCodeEditor) => void;
  lastError: AppError | null;
};
```

#### Dependencies on other hooks/stores

- **Depends on:** `useFileManager`, `useTabManager`, `uiStore` (focus + which pane is active), and editor binder/store.
- Should not depend on menu hook.

#### Eliminating refs-as-state

| Current ref used as state                         | Replace with                                                                                            |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `editorRef.current` as proxy for "current editor" | `editorStore.editor` (if UI depends on it) or `useKeyboardShortcuts` internal ref + expose `bindMonaco` |
| "is editor focused" ref                           | `uiStore.focusTarget` updated from focus/blur events                                                    |
| "active pane" ref                                 | `uiStore.activePane`                                                                                    |

---

## 3) Migration Strategy (safe extraction order)

1. **Inventory & label the refs-as-state (no behavior change).**  
   List each ref in `App.tsx`, what it represents, and whether the UI reacts to it; decide "store vs local state vs true ref".

2. **Introduce `documentStore` + minimal actions (no Dockview/Monaco wiring yet).**  
   Keep existing logic in `App.tsx`, but start reading "active doc id / docs list / dirty" from the store (single source of truth).

3. **Extract `useKeyboardShortcuts` first (lowest coupling).**  
   Implement shortcuts by calling _existing_ `App.tsx` handlers initially; then switch those handlers to store-backed actions once stable.

4. **Extract `useMenuListeners` next.**  
   Same approach: wire to existing handlers first, confirm cleanup/unmount correctness, then route through the new command functions.

5. **Extract `useFileManager` and move file open/save/dirty logic into it.**  
   Convert any ref-backed file state into `documentStore`. At this point `App.tsx` should stop "owning" file state and just render based on store.

6. **Extract `useTabManager` last (highest UI coupling).**  
   Make Dockview reflect `documentStore` + `tabStore`. Ensure Dockview events dispatch actions rather than mutating refs.

7. **Final cleanup pass: remove dead refs, inline leftovers into small components.**  
   Any remaining "layout composition" in `App.tsx` can move to `components/AppShell/*` if needed to stay under 300 LOC.

**Testing between steps:** after each extraction, run the same manual checklist (see §7) and verify store invariants (active doc/tab sync, dirty flags).

---

## 4) UX Considerations (what could go wrong)

- **Focus regressions:** switching tabs may stop focusing Monaco or may steal focus from dialogs; treat focus as explicit state (`uiStore.focusTarget`) and restore deliberately after tab switches.
- **Perceived lag / double execution:** menu + shortcut could both trigger the same command if events aren't deduped; centralize commands and ensure only one pathway fires per user action.
- **State loss on rapid actions:** opening/closing tabs quickly can race async file reads; ensure open/save operations are cancellable (AbortController) and last-write-wins is explicit.

---

## 5) Edge Cases to handle explicitly

- **Save during tab switch:** if user switches tabs while a save is in-flight, keep save bound to the original `DocumentId` and don't rely on "current active doc".
- **Unsaved changes across tabs:** closing one dirty doc must not affect dirty flags in others; "Save All" must iterate stable snapshot of doc ids.
- **Menu events during unmount:** Tauri listeners may still fire briefly; every listener must be unregistered in cleanup and async handlers must check `signal.aborted`.
- **Close tab while file picker open:** treat dialogs as modal state; closing should cancel pending operations or defer until picker resolves.
- **Duplicate open (same path):** opening an already-open URI should activate existing tab, not create a second doc (unless explicitly "Open Copy").
- **Web vs Tauri differences:** capabilities (native file dialogs, OS menus) differ; hooks must call `PlatformBridge` methods and interpret "not supported" errors cleanly.

---

## 6) Error Handling (how each hook surfaces errors)

**Shared pattern (recommended):**

- Each hook returns `lastError` (for debugging panels/logs).
- All user-visible errors go through `notificationStore.showError({title, message, details})`.
- Prefer `AppError` with `scope` and `recoverable` flags.

**Per hook:**

- `useFileManager`: wrap all bridge IO; on failure show toast ("Couldn't save file") and keep document dirty. For partial failures in `saveAll`, return counts + toast summary.
- `useTabManager`: handle Dockview API exceptions by falling back to store-only state (don't crash); toast only if it affects user outcome (e.g., tab can't be activated).
- `useMenuListeners`: if listener registration fails, toast once ("Menus unavailable on this platform") and degrade gracefully.
- `useKeyboardShortcuts`: if binding to Monaco fails, keep window-level shortcuts; don't throw.

---

## 7) Testing Strategy

### A) Invariants to verify (every step)

- **Single source of truth:** `activeDocumentId` changes only through store actions, and the UI reflects it.
- **No duplicate listeners:** menu/shortcut handlers fire exactly once per action (no accumulation after hot reload/navigation).
- **Dirty correctness:** typing marks only the active doc dirty; switching tabs preserves each doc's dirty flag.

### B) Manual regression checklist (high value)

1. Open file → edits → dirty indicator shows → Save → dirty clears.
2. Open 3 files → reorder/switch tabs → active editor content matches selected tab.
3. Close dirty tab → prompt flow (save/discard/cancel) behaves correctly.
4. Save As → writes new path/uri → tab title updates → subsequent Save uses new uri.
5. Trigger commands via **menu** and via **keyboard** (Open/Save/Close Tab/Save All).
6. Rapid actions: open+close quickly, switch tabs during save, spam Ctrl/Cmd+S.

### C) Hook-level tests (no UI, fastest)

- Mock `PlatformBridge` with deterministic results:
  - `readFile`, `writeFile`, `showOpenDialog`, `showSaveDialog`, `listenMenuEvent`
- Unit test file manager logic:
  - "open existing doc activates instead of duplicating"
  - "save uses passed id not active id"
  - "saveAll returns correct counts on partial failure"

### D) Integration tests (UI wiring)

- Render `AppShell` with mocked bridge and stores; simulate:
  - dispatch store actions → ensure Dockview adapter methods called
  - Dockview events → ensure store actions called

---

## 8) Final App.tsx Shape (pseudo-code)

```tsx
// App.tsx (goal: ~200–300 LOC)
export function App() {
  const platform = usePlatformBridge(); // existing abstraction

  // Core hooks (side effects + orchestration)
  const fileManager = useFileManager({ platform });
  const tabManager = useTabManager({ platform, fileManager });
  useMenuListeners({ platform, fileManager, tabManager });
  const shortcuts = useKeyboardShortcuts({ platform, fileManager, tabManager });

  // Store selectors for rendering
  const activeId = useDocumentStore((s) => s.activeDocumentId);
  const docs = useDocumentStore((s) => s.documentsOrdered); // selector
  const layout = useUiStore((s) => s.dockLayout);

  return (
    <AppProviders platform={platform}>
      <AppShell topBar={<TopBar />} leftSidebar={<LeftSidebar />} statusBar={<StatusBar />}>
        <DockviewLayout
          layout={layout}
          documents={docs}
          activeId={activeId}
          onReady={tabManager.bindDockview}
          renderEditor={(doc) => (
            <MonacoEditorPane documentId={doc.id} onEditorReady={shortcuts.bindMonaco} />
          )}
          renderPreview={(doc) => <PreviewPane documentId={doc.id} />}
        />
      </AppShell>
    </AppProviders>
  );
}
```

**Effort estimate:** **Large (3d+)** if you add tests and fully remove the 7+ ref-as-state patterns; **Medium (1–2d)** if stores already cover most state and you keep tests mostly manual.

**Escalation triggers (only if needed):**

- If Dockview + Monaco lifecycle coupling is too tangled, introduce a small "command registry" module (`commands.ts`) so menu/shortcuts/file actions share a single, testable dispatch surface without increasing hook interdependencies.
