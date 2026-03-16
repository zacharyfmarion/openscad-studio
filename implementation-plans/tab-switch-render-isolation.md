# Tab-Scoped Render State Migration

## Goal

Migrate the workspace from a single shared preview/render state to a tab-scoped render architecture where:

- each tab owns its own render state
- render results can only update the tab that requested them
- the active preview is derived from the active tab, not from global hook state
- dimension mode is per-tab and inferred from that tab's code/render history
- switching tabs, closing tabs, opening files, and returning to the welcome screen cannot leak preview state across tabs

This is intentionally a cleaner architectural migration, not a minimal patch.

## Root Cause

The current architecture splits responsibility in a way that makes the active preview nondeterministic:

1. `useOpenScad.ts` stores one shared `previewSrc`, `previewKind`, `diagnostics`, `error`, and `dimensionMode`.
2. `App.tsx` stores tabs separately and only mirrors some render state opportunistically when switching away from a tab.
3. The preview panel reads workspace-global render state, not the active tab's state.
4. Renders are asynchronous and not committed against tab identity, so out-of-order completion can overwrite the preview after the user has already switched tabs.
5. Welcome/file-open flows reuse the same global preview state unless manually cleared.

The bug is not just "tab switch forgot to rerender"; it is that the ownership model is wrong.

## Target Architecture

### 1. Tabs become the source of truth for document + render state

Expand `Tab` into a document record with render state embedded:

- `content`
- `savedContent`
- `isDirty`
- `render`
  - `status: 'idle' | 'rendering' | 'ready' | 'error'`
  - `previewSrc: string`
  - `previewKind: 'mesh' | 'svg'`
  - `diagnostics: Diagnostic[]`
  - `error: string`
  - `dimensionMode: '2d' | '3d' | null`
  - `lastRenderedContent: string | null`
  - `requestId: number`

The active preview becomes:

- `activeTab.render.previewSrc`
- `activeTab.render.previewKind`
- `activeTab.render.diagnostics`
- `activeTab.render.error`
- `activeTab.render.dimensionMode`

No separate workspace-global preview state should remain in `useOpenScad`.

### 2. `useOpenScad` becomes a render engine, not render state storage

`useOpenScad` should own:

- render service initialization
- render request execution
- dimension fallback logic
- worker/cache interaction
- request cancellation or invalidation

`useOpenScad` should not own:

- current preview image
- current diagnostics shown in the editor
- current active dimension mode
- current workspace-visible error

Instead it should expose an API like:

- `renderDocument({ tabId, code, preferredDimension, trigger }) -> Promise<RenderOutcome>`
- `cancelRequestsForTab(tabId)`
- `cancelAll()`
- `clearCachedBlob(url)`

And return structured outcomes:

- `tabId`
- `requestId`
- `resolvedDimension`
- `previewSrc`
- `previewKind`
- `diagnostics`
- `error`
- `status`

### 3. `App.tsx` / workspace state coordinates render ownership

`App.tsx` should:

- store tabs with render state
- assign a monotonic request id per tab when starting a render
- mark the tab as `rendering`
- accept a render result only if `result.requestId === tab.render.requestId`
- derive the preview panel/editor diagnostics from the active tab only

### 4. UI consumes active-tab derived state only

`WorkspaceContext` should expose active-tab derived values for compatibility during migration, but those values should come from `activeTab.render`, not from `useOpenScad`.

## Concrete Code Changes

### `apps/ui/src/components/TabBar.tsx`

- [ ] Replace ad-hoc cached preview fields with a typed `render` object on `Tab`.
- [ ] Add a shared `TabRenderState` type export or move the type to a more appropriate shared file.

### `apps/ui/src/App.tsx`

- [ ] Introduce helper constructors:
  - `createEmptyRenderState()`
  - `createTab(...)`
- [ ] Remove logic that copies global preview state into tabs during `switchTab()`.
- [ ] Remove the tab-switch rerender effect that exists solely to reconcile global hook state after the tab has already changed.
- [ ] Derive preview/editor/console props from `activeTab.render`.
- [ ] Start renders by updating the target tab's `render.requestId`, `status`, and optimistic visible state.
- [ ] Commit render results back into the matching tab only if request ids still match.
- [ ] When the active tab changes, simply update `activeTabId`; the visible preview should update immediately because it is tab-derived.
- [ ] When all tabs close or welcome is shown, the active preview naturally disappears because no active tab render state is selected.
- [ ] Audit all entry points that create/replace tabs:
  - new tab
  - open file
  - open recent
  - restore checkpoint
  - AI apply diff
  - save-as path changes

### `apps/ui/src/hooks/useOpenScad.ts`

- [ ] Remove React state for `previewSrc`, `previewKind`, `diagnostics`, `error`, and `dimensionMode`.
- [ ] Keep initialization, auxiliary file resolution, render execution, dimension fallback, and cleanup utilities.
- [ ] Return pure async functions and lifecycle helpers instead of workspace-visible render state.
- [ ] Keep render result blob lifecycle explicit so old URLs can be revoked when a tab render state is replaced or a tab closes.
- [ ] Preserve current dimension auto-detection behavior, but return the resolved dimension to the caller instead of mutating shared state.

### `apps/ui/src/contexts/WorkspaceContext.tsx`

- [ ] Keep the existing consumer API stable where possible, but back it with `activeTab`.
- [ ] If helpful, expose `activeTab` and/or `activeRender` explicitly for future cleanup.

### `apps/ui/src/components/panels/PanelComponents.tsx`

- [ ] No behavior change expected if context remains stable, but verify preview/editor/console panels now respond purely to active-tab state.

## Migration Strategy

The safest migration is staged so we preserve behavior while changing ownership.

### Phase 0: Lock in regression coverage first

- [ ] Add tests before changing architecture.
- [ ] These tests should fail on the current bug and continue protecting the migration.

### Phase 1: Introduce typed per-tab render state without changing behavior

- [ ] Add `render` object to `Tab`.
- [ ] Populate it from existing code paths.
- [ ] Continue feeding the UI from old global state temporarily.
- [ ] This gives us a compatibility layer and lets tests target the new state shape early.

### Phase 2: Change render pipeline ownership

- [ ] Refactor `useOpenScad` into a render engine that returns outcomes instead of setting preview React state.
- [ ] Update `App.tsx` to manage render requests and commit outcomes into tabs.
- [ ] Add per-tab request ids and stale-result dropping.

### Phase 3: Flip UI consumption to active-tab derived render state

- [ ] Point workspace context fields at `activeTab.render`.
- [ ] Remove switch-tab preview caching hacks and the delayed tab-switch rerender effect.
- [ ] Verify welcome/open/close flows.

### Phase 4: Remove compatibility code

- [ ] Delete obsolete global preview state from `useOpenScad`.
- [ ] Delete dead refs/effects tied to the old architecture.
- [ ] Re-run the full regression suite.

## Required Test Coverage

To feel safe about this migration, I would want coverage at three levels: engine, state orchestration, and UI flows.

### A. Render engine tests (`useOpenScad` / render pipeline)

- [ ] Returns `mesh` result for 3D render success.
- [ ] Returns `svg` result for 2D render success.
- [ ] When requested dimension produces empty output and opposite dimension succeeds, returns the resolved dimension instead of mutating shared state.
- [ ] Out-of-order completion test: older render result cannot be committed over a newer request when caller compares request ids.
- [ ] Error path test: actual diagnostics errors propagate as error outcome.
- [ ] Blob URL lifecycle test: replacing a preview revokes the old URL; discarded stale results do not leak URLs.
- [ ] Auxiliary files / working directory resolution behavior is unchanged by the refactor.

### B. App-level tab state tests

- [ ] New tab starts with empty render state, not inherited preview state.
- [ ] Switching tabs changes visible preview immediately to that tab's cached render state.
- [ ] Switching tabs triggers a fresh render for the target tab using that tab's own `dimensionMode` or preferred initial mode.
- [ ] Out-of-order render completion across two tabs updates only the owning tab.
- [ ] Rapid A -> B -> A switching leaves A's preview visible and prevents B's late render from hijacking the active preview.
- [ ] Closing the active tab reveals the adjacent tab's cached render state immediately.
- [ ] Closing the last tab and showing welcome leaves no preview state visible.
- [ ] Opening a file into the welcome placeholder starts from clean tab render state.
- [ ] Reopening an already-open file focuses the existing tab without mutating another tab's render state.
- [ ] Save / Save As does not reset render state incorrectly.
- [ ] AI/apply-diff and history restore update only the active tab's render state and request lineage.

### C. UI integration tests

- [ ] Editor diagnostics panel reflects only the active tab's diagnostics.
- [ ] Preview panel reflects only the active tab's preview kind (`mesh` vs `svg`).
- [ ] 2D tab -> new 3D tab -> back to 2D regression test.
- [ ] Close all tabs -> welcome -> reopen 2D regression test.
- [ ] A tab with no prior render shows empty/loading state, not another tab's preview.
- [ ] While a rerender is pending, cached preview remains visible for that tab.
- [ ] If render finishes with an error, only that tab shows the error.

### D. Timing / concurrency tests

- [ ] Render A starts, render B starts, B resolves first, A resolves second -> final visible state still belongs to B if B is current for that tab.
- [ ] Tab A render and tab B render in flight simultaneously -> each commits only to its own tab.
- [ ] Tab closes while render is in flight -> late result is ignored and blob is revoked.
- [ ] Welcome screen entered while render is in flight -> no late result should repopulate visible preview.
- [ ] Manual render, auto-idle render, save render, and tab-switch render all obey the same request-id rules.

## Specific Regressions To Guard Against

- [ ] Losing the current "dimension fallback" behavior that silently rescues 2D/3D mismatches.
- [ ] Breaking editor diagnostics because they currently read shared workspace diagnostics.
- [ ] Breaking export/capture flows that assume the current preview blob lives in one global place.
- [ ] Leaking blob URLs on tab close or repeated rerenders.
- [ ] Regressing recent-file replacement of the welcome tab.
- [ ] Regressing analytics events that currently assume one render timeline.

## Recommended Safety Gates

- [ ] Land test scaffolding first.
- [ ] Keep each migration phase small enough to review independently.
- [ ] Do not remove old compatibility fields until the active-tab derived UI path is already green.
- [ ] Run `pnpm --dir apps/ui test` and `pnpm --dir apps/ui lint` at each phase.
- [ ] If practical, add one focused browser/integration test for the original repro because timing bugs are easier to miss in pure unit tests.

## Recommendation

I recommend we implement the migration in phases, but with one architectural decision held constant from the start:

`Tab.render` is the only source of truth for preview state.

That gives us a model that is much easier to reason about, much safer under async timing, and much less likely to reintroduce cross-tab preview corruption later.
