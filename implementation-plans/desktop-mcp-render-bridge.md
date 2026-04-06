# Desktop MCP Render Bridge

## Goal

Add a desktop-only localhost MCP server that exposes Studio-specific render and verification tools for external agents without duplicating file read/write abilities they already have through the repo, plus a desktop-only export tool for writing render output to an explicit file path. Make the server safe for multiple Studio windows by binding each MCP session to a specific registered workspace window and routing requests only to that window. Replace the old "create a blank window, then steer it later" behavior with a bootstrap open controller, synchronous window bootstrap payloads, and request-scoped open acknowledgements so folders and files open reliably without getting stuck on the welcome screen.

## Approach

1. Add a Tauri-owned HTTP MCP server with runtime config, status reporting, and a frontend response bridge.
2. Add a frontend desktop MCP tool executor that uses the current workspace, render target, diagnostics, and preview state.
3. Add persisted MCP settings and an AI settings card with onboarding commands and copyable snippets.
4. Add targeted tests for tool behavior, settings defaults, and the new onboarding UI.
5. Add a desktop-only `export_file` MCP tool that exports the current render target to a caller-provided file path.
6. Add per-session MCP workspace binding, window-scoped request routing, and a single safe public `get_or_create_workspace` entrypoint.
7. Add desktop multi-window support with `Cmd+Shift+N` and focused-window menu dispatch.
8. Add a workspace creation/attach MCP path that reuses an already-open matching workspace, prefers an unused welcome window, and only creates a new window when needed.
9. Harden newly created or reused desktop windows with an explicit MCP bridge-ready handshake so the first tool request cannot race frontend startup.
10. Introduce first-class window launch intents and a shared desktop open-folder/open-file flow so new windows can open targets during boot instead of depending on a later MCP event.
11. Replace window-level "launch complete" bookkeeping with request-scoped open results that verify the exact folder opened before MCP binds the session.
12. Move startup-open orchestration into `main.tsx` so the full app shell mounts only after the window reaches a stable `welcome`, `ready`, or `open_failed` state.
13. Keep `App.tsx` focused on the editor shell while one shared window-open service handles startup opens, menu opens, recent-item opens, and MCP reuse.

## Affected Areas

- `apps/ui/src-tauri/src/`
- `apps/ui/src/services/`
- `apps/ui/src/stores/settingsStore.ts`
- `apps/ui/src/components/settings/`
- `apps/ui/src/App.tsx`
- `apps/ui/src/platform/`
- `apps/ui/src/platform/eventBus.ts`
- `apps/ui/src/utils/workspaceFolder.ts`
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
- [x] Replace public workspace selection tools with `get_or_create_workspace(folder_path)` and enforce binding for render-oriented tools
- [x] Register/update current Studio window context from the frontend and route MCP requests to the bound window only
- [x] Add desktop `New Window` support plus focused-window menu event routing
- [x] Update onboarding copy and validation for multi-window/session behavior
- [x] Add MCP workspace-creation/attach tool that binds to an existing matching workspace when possible
- [x] Reuse blank welcome windows for MCP workspace creation instead of always spawning a new window
- [x] Add targeted tests for workspace-creation routing and frontend folder initialization
- [x] Add an explicit desktop MCP bridge-ready handshake so new-window workspace creation does not race the frontend listener
- [x] Add a Tauri-owned window launch intent contract for welcome, open-folder, and open-file startup behavior
- [x] Add a dedicated desktop open-request/result channel for reusing already-open welcome windows
- [x] Unify folder/file opening in the frontend so launch-intent startup, menu actions, and MCP reuse the same codepath
- [x] Return targeted open/launch failures instead of leaving `get_or_create_workspace` hanging on the welcome screen
- [x] Inject new-window launch intents synchronously at webview creation time instead of storing them in Rust for later consumption
- [x] Wait for exact request-scoped open acknowledgements rather than generic window launch flags before binding MCP sessions
- [x] Show an explicit startup opening state instead of briefly settling on the welcome screen while a target is loading
- [x] Add a bootstrap open controller in `main.tsx` that resolves startup state before mounting the main app shell
- [x] Extract one shared window-open service for folder/file hydration across startup, menu, recent-item, and MCP flows
- [x] Remove startup-open orchestration from `App.tsx` so MCP correctness no longer depends on passive effects
- [x] Restore the codebase to production mode by removing temporary startup diagnosis logging and debug commands
