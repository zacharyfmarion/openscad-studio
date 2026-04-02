# Desktop MCP Render Bridge

## Goal

Add a desktop-only localhost MCP server that exposes Studio-specific render and verification tools for external agents without duplicating file read/write abilities they already have through the repo.

## Approach

1. Add a Tauri-owned HTTP MCP server with runtime config, status reporting, and a frontend response bridge.
2. Add a frontend desktop MCP tool executor that uses the current workspace, render target, diagnostics, and preview state.
3. Add persisted MCP settings and an AI settings card with onboarding commands and copyable snippets.
4. Add targeted tests for tool behavior, settings defaults, and the new onboarding UI.

## Affected Areas

- `apps/ui/src-tauri/src/`
- `apps/ui/src/services/`
- `apps/ui/src/stores/settingsStore.ts`
- `apps/ui/src/components/settings/`
- `apps/ui/src/App.tsx`
- `implementation-plans/desktop-mcp-render-bridge.md`

## Checklist

- [x] Review current desktop/render/workspace architecture on `main`
- [x] Add desktop MCP server state, commands, and HTTP transport in Tauri
- [x] Add frontend MCP bridge and Studio-specific tool execution
- [x] Persist MCP settings and sync them to the desktop server
- [x] Add AI settings onboarding UI for external agents
- [x] Add targeted tests and run validation
