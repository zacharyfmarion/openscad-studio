# React Error Boundaries for OpenSCAD Studio — Implementation Plan

## 1) Overview: Why per-panel error boundaries matter for a CAD editor

OpenSCAD Studio is a multi-surface app (Monaco editor, Three.js preview, AI chat, diagnostics, customizer, diff) where each panel has different failure modes and different "state you must not lose." A single unhandled render error in _any_ panel can currently take down the whole dockview layout (or trigger top-level crash recovery), which is disruptive during iterative CAD work.

Per-panel error boundaries isolate failures so that:

- The editor buffer and app session survive crashes in unrelated panels (e.g., 3D preview shader issues).
- Users can recover _only_ the broken panel via a "Reload Panel" action instead of losing workspace context.
- Cascading failures are contained (e.g., a broken diff view shouldn't prevent editing or preview).

---

## 2) Component Design: `<PanelErrorBoundary>` specification

### 2.1 Public API (Props)

```ts
type PanelErrorBoundaryProps = {
  panelId: string; // dockview panel id (stable identity)
  panelName: string; // user-facing name (Editor, Preview, AI Chat, etc.)
  onReset?: () => void | Promise<void>; // panel-specific cleanup/reinit hook
  fallbackRender?: (args: {
    panelName: string;
    error: Error;
    componentStack?: string;
    reset: () => void;
    isResetting: boolean;
    resetError?: Error;
  }) => React.ReactNode;
  children: React.ReactNode;
};
```

### 2.2 Internal state

```ts
type PanelErrorBoundaryState = {
  hasError: boolean;
  error?: Error;
  componentStack?: string;
  errorId?: string; // generated for correlation
  resetCounter: number; // increments to force remount
  isResetting: boolean;
  resetError?: Error;
};
```

### 2.3 Error capture behavior

Implement as a **class component** (no new dependencies):

- `static getDerivedStateFromError(error)` sets `hasError: true`, stores error, generates `errorId`.
- `componentDidCatch(error, info)` stores `info.componentStack` and triggers structured logging.

### 2.4 Recovery mechanism: "Reload Panel" behavior

1. Set `isResetting: true`, clear `resetError`.
2. Call `await onReset?.()` inside try/catch.
3. If succeeded: Clear error state, increment `resetCounter` to remount children (`key={resetCounter}`).
4. If failed: Keep fallback visible, store `resetError`, offer "Try again".

### 2.5 Default fallback UI

- Title: `"{panelName} crashed"`
- Message with hint "This panel can be reloaded without restarting the app."
- Buttons: **Reload Panel** (primary), **Copy error details**
- Expandable "Details" area (stack + component stack).

### 2.6 Integration with dockview

Wrap _inside_ each panel renderer:

```tsx
<PanelErrorBoundary panelId="preview" panelName="Preview">
  <PanelRoot key={resetCounter} />
</PanelErrorBoundary>
```

---

## 3) Panel-Specific Considerations

### 3.1 Editor panel (Monaco): unsaved code preservation

- Source of truth for buffer must live **outside** the boundary (store/context).
- On reset: recreate Monaco editor instance from external buffer state.
- Preserve `ITextModel` keyed by document id for undo/redo survival.

### 3.2 Preview / 3D panel (Three.js): WebGL context recovery

- Aggressively dispose Three.js resources on unmount/reset.
- Handle `webglcontextlost` / `webglcontextrestored` events explicitly.
- `onReset`: tear down renderer/scene/camera and recreate from last known mesh.

### 3.3 AI Chat panel: preserving conversation + stream

- Lift conversation history to app-level store outside boundary.
- On boundary error: cancel active stream, mark last message as "interrupted."
- On remount: rehydrate from stored messages.

### 3.4 Console / Diagnostics panel

- Simplest case. Safe to remount without special preservation.

### 3.5 Customizer panel

- Keep parsed parameter schema in a store.
- On reset: re-parse from current editor buffer.

### 3.6 Diff panel

- Store diff inputs outside boundary.
- On reset: clear caches, re-mount with same inputs.

---

## 4) UX Design

### 4.1 Preventing cascading failures

- Boundaries wrap only panel subtrees, not shared providers.

### 4.2 Reporting errors to AI

- Optional "Ask AI to help fix" action (opt-in, gated by confirmation).

---

## 5) Edge Cases

- **Error in boundary itself**: Ultra-minimal static fallback as belt-and-suspenders.
- **Errors during recovery/reset**: Cap rapid retries (3 in 10s → disable button).
- **Async errors**: Add `window.addEventListener('error'/'unhandledrejection')` centralized listeners.
- **Event handler errors**: Use `safeHandler(fn)` utility for high-risk handlers.
- **WebGL context lost**: Treat as state first, not exception.

---

## 6) Error Logging: structured format

```json
{
  "type": "ui_error",
  "timestamp": "2026-03-06T12:34:56.789Z",
  "app": { "name": "openscad-studio", "version": "x.y.z", "platform": "tauri|web" },
  "severity": "error",
  "source": "panel_boundary|global",
  "panel": { "id": "preview-1", "name": "Preview/3D" },
  "error": {
    "id": "err_...",
    "name": "TypeError",
    "message": "...",
    "stack": "...",
    "componentStack": "..."
  }
}
```

---

## 7) Testing Strategy

- **Intentional crashes**: Dev-only toggles per panel to verify isolation.
- **Unit tests**: `<PanelErrorBoundary>` with throwing child, verify fallback + reset.
- **Async error verification**: Verify global handlers log correctly.
- **WebGL**: Manual context loss simulation.

---

## 8) Implementation Order

1. Introduce `<PanelErrorBoundary>` + logging pipeline.
2. Wrap Console/Diagnostics panel first (lowest risk).
3. Wrap Diff panel.
4. Wrap Customizer panel.
5. Wrap AI Chat panel (lift message state first).
6. Wrap Editor panel (ensure buffer preservation).
7. Wrap Preview/3D panel last (most complex cleanup).

**Effort estimate:** Medium (1–2 days) if panel state stores exist; Large (3d+) if state must be refactored out of panels.
