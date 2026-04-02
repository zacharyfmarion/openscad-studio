# Desktop MCP Render Bridge

## Goal

Add a desktop-only localhost MCP server that exposes Studio-specific render and verification tools for external agents without duplicating file read/write abilities they already have through the repo, plus a desktop-only export tool for writing render output to an explicit file path. Make the server safe for multiple Studio windows by binding each MCP session to a specific registered workspace window and routing requests only to that window.

## Approach

1. Add a Tauri-owned HTTP MCP server with runtime config, status reporting, and a frontend response bridge.
2. Add a frontend desktop MCP tool executor that uses the current workspace, render target, diagnostics, and preview state.
3. Add persisted MCP settings and an AI settings card with onboarding commands and copyable snippets.
4. Add targeted tests for tool behavior, settings defaults, and the new onboarding UI.
5. Add a desktop-only `export_file` MCP tool that exports the current render target to a caller-provided file path.
6. Add per-session MCP workspace binding, explicit workspace-selection tools, and window-scoped request routing.
7. Add desktop multi-window support with `Cmd+Shift+N` and focused-window menu dispatch.

## Affected Areas

- `apps/ui/src-tauri/src/`
- `apps/ui/src/services/`
- `apps/ui/src/stores/settingsStore.ts`
- `apps/ui/src/components/settings/`
- `apps/ui/src/App.tsx`
- `apps/ui/src/platform/`
- `implementation-plans/desktop-mcp-render-bridge.md`

## Checklist

- [x] Review current desktop/render/workspace architecture on `main`
- [x] Add desktop MCP server state, commands, and HTTP transport in Tauri
- [x] Add frontend MCP bridge and Studio-specific tool execution
- [x] Persist MCP settings and sync them to the desktop server
- [x] Add AI settings onboarding UI for external agents
- [x] Add targeted tests and run validation
- [x] Add desktop-only MCP export support for writing render output to a file path
- [x] Add Rust-side window registry and per-session MCP binding
- [x] Add MCP workspace listing/selection tools and enforce binding for render-oriented tools
- [x] Register/update current Studio window context from the frontend and route MCP requests to the bound window only
- [x] Add desktop `New Window` support plus focused-window menu event routing
- [x] Update onboarding copy and validation for multi-window/session behavior
