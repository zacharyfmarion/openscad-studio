# Phase 4B.1: Decompose App.tsx (1189 lines → <300)

## Summary

Refactor `apps/ui/src/App.tsx` by extracting tab state, file workflows, menu/event wiring, and keyboard shortcuts into four hooks, and replace the current "keep a bunch of refs in sync" pattern with stable callbacks + `useLatest()` inside hooks. This breaks the current circularities without re-subscribing menu listeners on every keystroke, and gets App.tsx to "hooks composition + JSX only" (<300 LOC) with zero UX changes.

## Effort Estimate

Medium (1–2 days)

## Current State Analysis

From the current file (1277 LOC), the main extractable regions are:

- **Tab state + derived working dir**: `tabs`, `activeTabId`, `activeTab`, `workingDir` (~150–173)
- **OpenSCAD engine wiring**: `useOpenScad({ workingDir, ...settings })` and undo/redo integration (~183–213)
- **AI wiring and cross-cutting refs**: `useAiAgent()` plus preview capture + working dir/aux-file propagation (~214–455)
- **Tab operations**: `createNewTab`, `switchTab`, `closeTab`, `updateTabContent`, `reorderTabs` (~243–368)
- **Refs-as-state anti-pattern**: `activeTabRef`, `tabsRef`, `sourceRef`, `workingDirRef`, `renderOnSaveRef`, `manualRenderRef`, `updateSourceAndRenderRef`, plus other refs (~371–513, 739–767)
- **File operations**: `saveFile` (format-on-save + platform save + dock title + recent files + render-on-save) (~522–596)
- **Open workflows**: `handleOpenRecent`, `handleOpenFile` (~626–736)
- **Unsaved changes prompt**: `checkUnsavedChangesRef.current = async () => ...` (~737–767)
- **Menu listeners (eventBus)**: `eventBus.on('menu:file:new|open|save|save_as|export')` (~769–864)
- **Other listeners**: `platform.onCloseRequested`, `eventBus.on('render-requested')`, `eventBus.on('history:restore')`, `eventBus.on('code-updated')` (~866–929)
- **Keyboard shortcuts**: global `keydown` for ⌘K/⌘,/⌘T/⌘W (~931–960)
- **Dockview setup + layout persistence**: `onDockviewReady` (~969–984)
- **Layout/JSX**: welcome screen branch + header + dockview + dialogs (~1064–1275)

## Hook Extraction Strategy

### Foundation Utilities

Create `apps/ui/src/hooks/useLatest.ts`:

```ts
import { useEffect, useRef } from 'react';
export function useLatest<T>(value: T) {
  const ref = useRef(value);
  useEffect(() => {
    ref.current = value;
  }, [value]);
  return ref;
}
```

Optional `apps/ui/src/hooks/useEventCallback.ts`:

```ts
import { useCallback } from 'react';
import { useLatest } from './useLatest';
export function useEventCallback<T extends (...args: any[]) => any>(fn: T): T {
  const fnRef = useLatest(fn);
  return useCallback(((...args) => fnRef.current(...args)) as T, []);
}
```

### Hook 1: `useTabManager`

Owns: `tabs`, `activeTabId`, derived `activeTab`, and pure mutations. No dialogs, no platform calls, no toasts.

```ts
export interface TabManagerApi {
  tabs: Tab[];
  activeTabId: string;
  activeTab: Tab;
  createNewTab(args?: { filePath?: string | null; name?: string; content?: string }): string;
  switchTab(id: string): void;
  closeTab(id: string): void;
  updateTabContent(id: string, content: string): void;
  reorderTabs(tabs: Tab[]): void;
  findTabByPath(path: string): Tab | undefined;
  setTabSaved(
    id: string,
    args: { filePath: string | null; name: string; savedContent: string }
  ): void;
  replaceActiveTabContent(code: string): void;
}
```

### Hook 2: `useFileManager`

Owns: `showWelcome` and all file/prompt workflows. Uses `getPlatform()` + `loadSettings()` + `formatOpenScadCode()` + `getDockviewApi()` + `addToRecentFiles()`.

```ts
export interface FileManagerApi {
  showWelcome: boolean;
  startManually(): void;
  startWithPrompt(prompt: string): void;
  checkUnsavedChanges(): Promise<boolean>;
  saveFile(args?: { saveAs?: boolean }): Promise<boolean>;
  handleOpenFile(): Promise<void>;
  handleOpenRecent(path: string): Promise<void>;
  requestCloseTab(id: string): Promise<void>;
}
```

### Hook 3: `useMenuListeners`

Owns: only eventBus.on(...) registrations and mapping to injected actions.

```ts
export function useMenuListeners(opts: {
  onMenuNewFile: () => Promise<void> | void;
  onMenuOpen: () => Promise<void>;
  onMenuSave: () => Promise<void>;
  onMenuSaveAs: () => Promise<void>;
  onMenuExport: (format: ExportFormat) => Promise<void>;
  onRenderRequested: () => void;
  onHistoryRestore: (code: string) => void;
  onCodeUpdated: (code: string) => void;
}): void;
```

### Hook 4: `useKeyboardShortcuts`

Owns: global keydown and cleanup.

```ts
export function useKeyboardShortcuts(opts: {
  onFocusAiPrompt: () => void;
  onOpenSettings: () => void;
  onNewTab: () => void;
  onCloseActiveTab: () => void;
}): void;
```

## Migration Order (Dependency Graph)

1. `useLatest` / `useEventCallback` (foundation)
2. `useTabManager` (pure state)
3. `useFileManager` (depends on tab manager + platform + stable source/render callbacks)
4. `useMenuListeners` (depends on file manager + tab manager + history/code handlers)
5. `useKeyboardShortcuts` (depends on file manager/tab manager + AI ref + settings UI handlers)

## Hook Communication Strategy

Use injection via stable callbacks, not shared state refs in App.tsx:

- `useFileManager` gets: `tabManager` API, `getSource()` and `setSource()`, `onRenderOnSave()`
- `useMenuListeners` gets: `fileManager` actions, export action, history/code handlers
- `useKeyboardShortcuts` gets: `aiPromptPanelRef`, `setShowSettingsDialog`, `tabManager.createNewTab`, `fileManager.requestCloseTab`

## Refs-to-State Migration

- Put "latest" refs inside the hooks via `useLatest()` only where unavoidable
- Use `useEventCallback()` so subscription effects depend on stable functions
- Keep actual state as React state inside hooks, not in refs
- Refs are only for "read latest inside stable listener"

## Testing Strategy

Run and extend existing Playwright coverage:

- Tabs: `e2e/tests/tabs/multi-tab.tauri.spec.ts`
- File open/save: `e2e/tests/file-management/open-save.tauri.spec.ts` and web variant
- New file / welcome: `e2e/tests/file-management/new-file.spec.ts`
- Shortcuts: `e2e/tests/integration/keyboard-shortcuts.spec.ts`
- Undo/redo: `e2e/tests/history/undo-redo.spec.ts`

## Error Handling Risks

- Listener churn/perf regression if handlers depend on `source` and re-subscribe per keystroke
- State desync between Monaco → `source` and `tabs[active].content`
- Platform differences (web: no real paths)

## Edge Cases

- Opening a file already open in a tab → must focus existing tab
- Close-active-tab when it's the last tab → must recreate default "Untitled" tab
- History restore / code-updated events → must update both OpenSCAD source and tab dirty computation

## UX Impact

Zero user-visible changes: same dialogs, same welcome gating, same keybindings, same tab behaviors, same toasts.

## Rollback Plan

Do the extraction in small, testable commits per hook. If a regression appears, revert the single hook commit and re-run affected Playwright specs.

## Alternative Approach

If many "latest" refs remain after extraction (10+ across hooks), consider moving tab state to a dedicated Zustand store instead.
