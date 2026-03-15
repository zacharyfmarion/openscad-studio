# Zustand Workspace Store Migration

## Goal

Migrate workspace state management from `App.tsx`-owned React state to a Zustand-backed workspace store that is:

- easier to reason about
- easier to test in isolation
- resilient to async timing bugs
- explicit about state ownership
- a clean foundation for per-tab render state

This migration should reduce the likelihood of bugs caused by split ownership, stale closures, and async render races.

## Principles

1. **Single source of truth**: tab/document/render state should live in one store.
2. **Pure store, impure edges**: keep file I/O, render execution, analytics, toasts, Dockview, and platform APIs outside the store initially.
3. **Per-tab render ownership**: render results belong to a tab, not to the workspace globally.
4. **Deterministic actions**: store actions should be synchronous, side-effect-light, and easy to unit test.
5. **Selector-driven UI**: components should read small, focused slices of state instead of the whole workspace object.
6. **Incremental migration**: keep compatibility layers until each phase is fully covered by tests.

## Why This Is A Good First Zustand Slice

The current state problem is concentrated in one domain:

- tabs
- active document
- welcome/empty workspace state
- per-tab render state

That is cohesive enough to make a good Zustand slice.

It is **not** a good idea to move these into Zustand yet:

- Dockview API instances
- platform dialogs / filesystem effects
- notifications
- analytics
- AI chat orchestration
- render worker implementation details

Those should call into the workspace store, not live inside it.

## Scope

### In Scope

- Workspace tab state
- Active tab selection
- Welcome state
- Per-tab render state
- Pure tab/render mutations
- Selector layer for active tab, active render, working directory

### Out of Scope For First Migration

- File open/save side effects
- Dockview layout state
- AI chat state
- Settings store migration
- Render service migration into Zustand middleware
- Export workflows

## Target Store Shape

Create a new store, for example:

- `apps/ui/src/stores/workspaceStore.ts`

Recommended types:

```ts
export type TabId = string;

export interface TabRenderState {
  status: 'idle' | 'rendering' | 'ready' | 'error';
  previewSrc: string;
  previewKind: 'mesh' | 'svg';
  diagnostics: Diagnostic[];
  error: string;
  dimensionMode: '2d' | '3d' | null;
  lastRenderedContent: string | null;
  requestId: number;
}

export interface WorkspaceTab {
  id: TabId;
  filePath: string | null;
  name: string;
  content: string;
  savedContent: string;
  isDirty: boolean;
  render: TabRenderState;
}

export interface WorkspaceState {
  tabs: WorkspaceTab[];
  activeTabId: TabId | null;
  showWelcome: boolean;
}

export interface WorkspaceActions {
  createTab(args?: {
    filePath?: string | null;
    name?: string;
    content?: string;
    activate?: boolean;
  }): TabId;
  setActiveTab(id: TabId): void;
  updateTabContent(id: TabId, content: string): void;
  renameTab(id: TabId, name: string): void;
  markTabSaved(id: TabId, args: { filePath: string | null; name: string; savedContent: string }): void;
  closeTabLocal(id: TabId): void;
  replaceWelcomeTab(args: { filePath: string | null; name: string; content: string }): TabId;
  reorderTabs(tabIdsInOrder: TabId[]): void;

  beginTabRender(id: TabId, args?: { preferredDimension?: '2d' | '3d' | null }): number;
  commitTabRenderResult(
    id: TabId,
    result: {
      requestId: number;
      previewSrc: string;
      previewKind: 'mesh' | 'svg';
      diagnostics: Diagnostic[];
      dimensionMode: '2d' | '3d';
      lastRenderedContent: string;
    }
  ): void;
  commitTabRenderError(
    id: TabId,
    result: {
      requestId: number;
      error: string;
      diagnostics?: Diagnostic[];
      lastRenderedContent?: string;
    }
  ): void;
  invalidateTabRender(id: TabId): void;
  clearTabRender(id: TabId): void;

  showWelcomeScreen(): void;
  hideWelcomeScreen(): void;
}
```

## Important Derived Selectors

Prefer exporting selectors/hooks rather than exposing raw store state everywhere.

Examples:

- `useTabs()`
- `useActiveTabId()`
- `useActiveTab()`
- `useActiveRender()`
- `useShowWelcome()`
- `useWorkingDirectory()`
- `useCanCloseWithoutPrompt(id)`

Derived selectors should compute:

- active tab
- active render state
- active diagnostics
- active preview kind/src
- working directory from active tab path

This keeps rendering components simple and avoids repeating logic across `App.tsx`, panels, and event handlers.

## Store Action Design

### Pure actions only

Store actions should:

- update data
- enforce invariants
- reject stale render results by request id

Store actions should not:

- call `getPlatform()`
- show toasts
- call analytics
- talk to workers
- read/write local storage directly unless we explicitly add persistence later

### Invariants the store should own

- only one active tab at a time
- active tab must exist if tabs are non-empty
- welcome screen state and active tab state stay coherent
- render result only applies if `requestId` matches current tab request
- closing a tab cannot leave dangling active ids
- new tabs start with empty render state
- replacing the welcome tab creates clean render state

## Recommended File Structure

Suggested first-pass structure:

- `apps/ui/src/stores/workspaceStore.ts`
- `apps/ui/src/stores/workspaceSelectors.ts`
- `apps/ui/src/stores/workspaceTypes.ts`
- `apps/ui/src/stores/__tests__/workspaceStore.test.ts`

Optional helpers:

- `apps/ui/src/stores/workspaceFactories.ts`
  - `createEmptyRenderState()`
  - `createWorkspaceTab()`

This keeps the store readable and makes types reusable in the render engine and context.

## Integration Boundary

### `App.tsx`

`App.tsx` should become an orchestrator, not the owner of workspace state.

It should:

- read focused selectors from the store
- call store actions in response to UI events
- trigger side effects externally

It should no longer own:

- `tabs`
- `activeTabId`
- `showWelcome`
- per-tab render cache

### `useOpenScad.ts`

This hook should evolve into a render engine/service hook.

It should:

- receive `code`, `tabId`, `requestId`, preferred dimension, and trigger
- resolve files
- perform render
- return a structured render result

It should not own active preview state.

### `WorkspaceContext`

Short term:

- keep `WorkspaceContext` for compatibility
- back it with Zustand selectors instead of `App.tsx` local state

Long term:

- components that only need workspace state can read directly from Zustand
- context remains only for transient orchestration if still needed

## Testing Strategy

The migration should be test-first enough to let us refactor with confidence.

### 1. Store unit tests

These are the most important new tests.

Add `apps/ui/src/stores/__tests__/workspaceStore.test.ts` covering:

- initializes with one untitled tab or a predictable empty state, depending on chosen factory
- `createTab` creates clean render state
- `setActiveTab` switches active id without mutating other tabs
- `updateTabContent` marks dirty state correctly
- `markTabSaved` clears dirty state correctly
- `closeTabLocal` picks the next active tab correctly
- closing the last tab enters welcome state cleanly
- `replaceWelcomeTab` resets render state instead of inheriting stale preview
- `beginTabRender` increments `requestId` and marks status rendering
- `commitTabRenderResult` succeeds only for matching request id
- stale render results are ignored
- `commitTabRenderError` succeeds only for matching request id
- `invalidateTabRender` prevents late results from applying
- `clearTabRender` removes visible preview/error/diagnostics

### 2. Selector tests

Add focused selector tests or test through store state:

- active tab selector returns the right tab
- working directory selector derives correctly from active file path
- active diagnostics/preview selector changes when active tab changes
- welcome state with no active tab behaves safely

### 3. App integration tests

Keep or add integration tests to verify wiring:

- switching tabs changes visible preview by active tab
- 2D tab -> new 3D tab -> back to 2D regression
- close all -> welcome -> reopen file regression
- opening a file into the welcome placeholder does not reuse stale render state

### 4. Render orchestration tests

At the hook/service layer:

- render result for tab A does not update tab B
- out-of-order completion is ignored by store because of request ids
- dimension fallback returns per-tab resolved mode
- tab close during in-flight render ignores late completion

## Migration Phases

### Phase 1: Introduce types and store without changing visible behavior

- [x] Create workspace types/factories
- [x] Create Zustand workspace store with pure tab and render actions
- [x] Add store unit tests
- [x] Keep `App.tsx` behavior unchanged for the moment

### Phase 2: Move tab/document state into the store

- [x] Replace `tabs`, `activeTabId`, and `showWelcome` local state in `App.tsx`
- [x] Update tab operations to call store actions
- [x] Keep file open/save logic in `App.tsx`, but have it dispatch into the store
- [ ] Add integration tests for tab operations

### Phase 3: Move per-tab render state into the store

- [x] Add `render` object to every tab
- [x] Update preview/diagnostics consumers to read from active tab render state
- [x] Remove ad-hoc render caching from tab switch logic
- [x] Add tests for active-tab derived preview/diagnostics

### Phase 4: Refactor `useOpenScad` into a render engine

- [x] Replace shared React render state with render outcome returns
- [x] Use `beginTabRender` / `commitTabRenderResult` / `commitTabRenderError`
- [x] Enforce request-id stale-result rejection
- [ ] Add concurrency and timing tests

### Phase 5: Remove compatibility layers

- [ ] Simplify `WorkspaceContext`
- [ ] Delete obsolete refs/effects in `App.tsx`
- [ ] Delete old global preview state from `useOpenScad`
- [ ] Re-run full test suite and fix any incidental regressions

## Maintainability Rules

To keep this migration healthy:

- Prefer small store actions with clear names over large multipurpose actions.
- Keep async workflows in hooks/services that call the store, not inside the store body.
- Use selectors so components only subscribe to what they render.
- Avoid exposing the raw full state object unless necessary.
- Keep render request ids per tab, not global, so reasoning stays local.
- Use factory helpers for tab/render initialization so we don’t duplicate defaults.
- Treat blob URL cleanup as part of render lifecycle ownership, with explicit tests.

## Recommendation

Yes, use Zustand here.

The best first slice is a **workspace slice** centered on:

- tabs
- active tab
- welcome state
- per-tab render state

That is cohesive, testable, and directly addresses the ownership bug class we want to eliminate.

The key to keeping it maintainable is to resist putting side effects into the store too early. Let Zustand own the data model and invariants first; let hooks/services keep owning effects until the domain is stable.
