# Phase 4B.2: Per-Panel Error Boundaries

## Summary

Implement a reusable `PanelErrorBoundary` and wrap each Dockview panel component (Editor/Preview/AI/Console/Customizer/Diff) so a single panel crash degrades to an inline fallback instead of taking down the whole app. Keep the existing top-level `ErrorBoundary` as the last-resort safety net, and add a simple "Retry (remount)" recovery path per panel.

## Effort Estimate

Medium (1–2 days)

## Action Plan

1. **Audit current boundary**: Confirm where the top-level `ErrorBoundary` is mounted (likely `main.tsx`) and document its fallback behavior (full-screen + Reload).
2. **Add a `panelErrorStore` (Zustand)**: Track `{ [panelInstanceId]: { panelType, message, stack?, time } }` plus `setPanelError/clearPanelError` for UI + tests.
3. **Create `PanelErrorBoundary`**: Class-based boundary with `componentDidCatch`, a "Retry" that clears error + increments a `remountNonce`, and optional "Reload app" secondary action.
4. **Implement per-panel fallback UIs**: A small `PanelErrorFallback` that switches by `panelType` and uses the app theme tokens.
5. **Wrap Dockview panels**: In `PanelComponents.tsx`, split each panel into `XPanelInner` and `XPanel` so all panel hooks/rendering run inside the boundary.
6. **Surface errors to users**: On first crash per panel instance, show a `sonner` toast and mark the tab header with a subtle error dot/badge.
7. **Add Playwright coverage**: Add a test-only crash trigger (localStorage flag), verify isolation + Retry behavior + top-level boundary remains intact.

## PanelErrorBoundary Design

- Props: `panelType`, `panelInstanceId`, optional `title`, optional `onRetryExtra`
- State: `{ hasError, error, remountNonce }`
- `static getDerivedStateFromError(error)` sets `hasError`
- `componentDidCatch(error, info)` writes to `panelErrorStore` + `console.error`
- Retry handler: clears error + increments `remountNonce`
- Render children inside `<div key={remountNonce}>…</div>` for clean remount

## Fallback UI Per Panel Type

- **Editor**: "Editor temporarily unavailable." → Retry editor / Reload app
- **Preview**: "Preview failed to render (WebGL/SVG)." → Retry preview / Reload app
- **AI Chat**: "AI panel crashed." → Retry AI panel / Reload app
- **Console/Diagnostics**: "Console panel crashed." → Retry console
- **Customizer**: "Customizer failed." → Retry customizer
- **DiffViewer**: "Diff view failed." → Retry diff view

## Error Reporting

- Inline in the panel: fallback UI with optional "Details" disclosure
- Toast (sonner): single toast per panel instance on crash
- Tab header indicator: subtle dot/badge via `panelErrorStore`

## Dockview Integration

```
const PreviewPanelInner = () => { const ws = useWorkspace(); return <Preview .../> }
const PreviewPanel = (props) => (
  <PanelErrorBoundary panelType="preview" panelInstanceId={props.api.id}>
    <PreviewPanelInner/>
  </PanelErrorBoundary>
)
```

## Edge Cases

- Event handler / async errors aren't caught by React error boundaries → need local try/catch
- Fallback must not crash → keep it dependency-light
- Toast spam in React dev/StrictMode → gate toast to fire once per panel instance
- If WebGL failures frequently require full context reset → dedicated "Reset preview engine" action
