# OpenSCAD Studio — Engineering Roadmap

> Current app version: **v1.2.1**. This roadmap mixes historical milestone notes with future planning, so older phase sections may reference the version they originally shipped in rather than the current release.
>
> A modern OpenSCAD editor with live preview and AI copilot capabilities, available as both a web app and a macOS desktop app. The application uses openscad-wasm for rendering and provides a superior editing experience with real-time feedback and AI-assisted code generation.

---

## Ordering Principles

1. **Quick wins first.** Small changes that dramatically improve perceived quality ship before large features.
2. **AI is the moat.** The AI copilot is the reason someone chooses this over the stock OpenSCAD editor. Every phase deepens that advantage.
3. **Architecture before features.** Structural debt (App.tsx size, error handling, missing tests) is addressed early so later features don't compound the mess.
4. **Desktop-first, web-ready.** `AGENTS.md` documents the current platform split and client-side AI architecture. Refactors in this roadmap move toward that interface without blocking desktop progress.

---

## ✅ Phase 1: Minimal Vertical Slice (COMPLETED)

**Goal:** Establish basic end-to-end workflow with live preview

- ✅ Project scaffolding: Tauri + React monorepo with pnpm workspaces
- ✅ Monaco editor with custom OpenSCAD syntax highlighting
- ✅ Live preview: PNG rendering with 300ms debounced updates
- ✅ Auto-detect OpenSCAD binary in PATH or common installation locations
- ✅ Error diagnostics: Parse OpenSCAD stderr, display as inline markers
- ✅ Diagnostics panel: Clickable error/warning list
- ✅ Cache-busted preview (timestamp-based image refresh)

**Completed:** Early 2025

---

## ✅ Phase 2: Advanced Rendering & 3D Viewer (COMPLETED)

**Goal:** Interactive 3D mesh viewing and optimized rendering pipeline

- ✅ STL export and Three.js STL loader for interactive 3D viewing
- ✅ OrbitControls, proper lighting, grid helper with fade
- ✅ Toggle between PNG (fast) and STL (interactive) modes
- ✅ Content-hash caching (SHA-256 → artifact path)
- ✅ Export dialog: STL, OBJ, AMF, 3MF, PNG, SVG, DXF
- ✅ 2D SVG mode with inline pan/zoom viewer
- ✅ Settings modal (theme, editor, AI tabs, OpenSCAD path override)
- [ ] Resolution scaling (low-res while typing, high-res on idle) — deferred
- [ ] Progress indicator for slow renders — deferred

**Completed:** Mid 2025

---

## ✅ Phase 3: AI Copilot Integration (COMPLETED)

**Goal:** Cursor-like AI experience with diff-based code editing and a strong model/tooling workflow

> **Note:** Some bullets in this phase are historical. The current app uses a client-side TypeScript AI agent built on the Vercel AI SDK, and API keys are stored client-side as described in `AGENTS.md`.

- ✅ Native Rust AI agent exploration (historical)
- ✅ Current production AI flow uses the shared frontend TypeScript agent and direct provider requests
- ✅ Diff-based editing: exact string replacement, max 120 lines, validated before apply
- ✅ Tools: get code, screenshot, apply diff, diagnostics, render
- ✅ SSE streaming with incremental text deltas
- ✅ AiPromptPanel, ModelSelector, DiffViewer UI components
- ✅ Multi-turn tool calling with automatic execution
- ✅ Conversation persistence (save/load/delete)
- ✅ Checkpoint-based undo with "restore to before this turn"
- ✅ Multi-provider support (Anthropic + OpenAI)

**Completed:** October 2025 (v0.2.0)

---

## ✅ Phase 4A: Quick Wins & Polish (COMPLETED)

**Goal:** Ship the changes with the highest impact-to-effort ratio.

### ✅ 4A.1: Toast Notification System

- [x] Added `sonner` toast library, replaced all `alert()` / `confirm()` calls
- [x] Categorized toasts: success (green), error (red), info (neutral)
- [x] Auto-dismiss success toasts after 3s; errors persist until dismissed

### ✅ 4A.2: Markdown Rendering in AI Chat

- [x] `react-markdown` + `remark-gfm` + `react-syntax-highlighter`
- [x] Assistant messages render as markdown with OpenSCAD syntax highlighting
- [x] User messages remain plain text

### ✅ 4A.3: Auto-Render on Idle

- [x] Debounced auto-render (500ms after last keystroke) as a setting
- [x] Default: off (preserves explicit-render behavior)
- [x] Cancel in-flight render if source changes before completion

### ✅ 4A.4: Strip Debug Logging

- [x] Console.log gated behind `import.meta.env.DEV`
- [x] `console.error` and `console.warn` preserved for genuine errors

### ✅ 4A.5: Smart Welcome Screen

- [x] API key check on mount with setup CTA
- [x] Always show "Open File" and "Start with empty project" prominently

### ✅ 4A.6: ECHO Output in Console

- [x] Separate "Output" section in DiagnosticsPanel for ECHO messages
- [x] ECHO messages with distinct styling (not error red)

**Success criteria:** ✅ App feels polished. No browser `alert()` popups. AI chat looks professional.

---

## Phase 4B: Architecture Cleanup (~1 week)

**Goal:** Reduce structural debt so subsequent features don't fight the codebase. No user-visible changes.

### 4B.1: Decompose App.tsx (1189 lines → <300)

- [ ] Extract `useFileManager` hook:
  - `saveFile`, `checkUnsavedChanges`, `handleOpenFile`, `handleOpenRecent`
  - File dialog interactions, unsaved changes prompts
- [ ] Extract `useTabManager` hook:
  - `createNewTab`, `switchTab`, `closeTab`, `updateTabContent`, `reorderTabs`
  - Tab state, active tab tracking
- [ ] Extract `useMenuListeners` hook:
  - All `listen('menu:file:*')` event registrations
  - All `listen('render-requested')` and `listen('history:restore')` registrations
- [ ] Extract `useKeyboardShortcuts` hook:
  - `⌘K`, `⌘,`, `⌘T`, `⌘W` handlers
- [ ] App.tsx becomes: composition of hooks + JSX layout only
- [ ] Eliminate the 7+ refs-as-state pattern by moving state to hooks

### ✅ 4B.2: React Error Boundaries (COMPLETED)

- [x] Created `<ErrorBoundary>` component (`ErrorBoundary.tsx`)
- [x] Wraps top-level app to prevent full crashes
- [x] Error boundary shows fallback UI with error details
- [x] Prevents a crash in one area from taking down the entire app
- [x] Log errors to `console.error` with component stack
- [ ] Wrap each dockview panel individually (Editor, Preview, AI Chat, Console, Customizer, Diff) — currently only top-level boundary exists

### 4B.3: Centralized State Management

- [ ] Evaluate whether `zustand` or a context-based approach would reduce the ref-heavy patterns
- [ ] At minimum: create a `useEditorState` zustand store for the source/diagnostics/preview state that both `useOpenScad` and `useAiAgent` share
- [ ] Eliminate the `EditorState` duplication between frontend React state and backend Rust `EditorState`
  - Currently both sides maintain separate copies and sync via IPC
  - Backend should be the source of truth; frontend reads via events

### ✅ 4B.4: Platform Abstraction (COMPLETED)

- [x] Created `PlatformBridge` interface in `platform/types.ts`
- [x] Created `TauriBridge` implementation wrapping Tauri IPC calls
- [x] Created `WebBridge` implementation for browser runtime
- [x] Platform provider wired up in `main.tsx` / app entry
- [x] `useOpenScad.ts` uses platform bridge for rendering
- [x] `useAiAgent.ts` uses platform bridge for AI
- [x] Both desktop and web work via the same abstraction

**Success criteria:** No component can crash the whole app. State flows are clear. Platform abstraction exists. App.tsx decomposition and centralized state remain as follow-up work.

---

## ✅ Phase 4C: Library Management & Include Resolution (COMPLETED)

**Goal:** Support OpenSCAD's `include`/`use` statements and external library paths (e.g., BOSL2).

### ✅ 4C.1: Library Path Infrastructure

- [x] Added library settings store (`settingsStore.ts`) for managing library paths
- [x] Added `PlatformBridge` methods for library path discovery and file loading
- [x] Implemented library path discovery and recursive file loading in `TauriBridge`
- [x] Web bridge stubs (libraries managed differently in browser context)
- [x] Added Tauri filesystem permissions for library path access

### ✅ 4C.2: Libraries Settings UI

- [x] Added "Libraries" tab in `SettingsDialog.tsx`
- [x] UI for adding/removing library paths (e.g., `~/Documents/OpenSCAD/libraries/BOSL2`)
- [x] Library paths persisted in settings store

### ✅ 4C.3: Render Pipeline Integration

- [x] Merged library files into the render pipeline (`useOpenScad.ts`)
- [x] `include`/`use` statements resolved against configured library paths
- [x] Library files mounted into WASM filesystem for web rendering
- [x] Desktop: files passed to OpenSCAD via working directory and library paths

### ✅ 4C.4: Testing

- [x] E2E tests for include resolution and BOSL2 integration
- [x] Test fixtures for nested includes, `use`/`include` variants, and multi-file libraries

**Completed:** March 2026 (v0.7.1)
**Success criteria:** ✅ Users can configure library paths, use BOSL2 and other libraries, and `include`/`use` statements resolve correctly in both desktop and web.

---

## Phase 5: AI Experience (~2 weeks)

**Goal:** Make the AI copilot competitive with Cursor/Copilot-level UX. This is the app's differentiator.

### 5.1: Conversation History Sidebar

- [ ] Add "Conversations" as a dockview panel option (alongside Editor, Preview, AI, Console)
- [ ] List saved conversations with title, date, message count
- [ ] Click to load a conversation
- [ ] Delete conversations with confirmation
- [ ] Search across conversation titles
- [ ] Backend already supports `save_conversation`, `load_conversations`, `delete_conversation`
- [ ] Frontend just needs the UI — `loadConversation` already exists in `useAiAgent`

### 5.2: Image Input for AI

- [ ] Add image paste/drag-drop support to the AI prompt textarea
- [ ] Support: clipboard paste, file drag-drop, file picker button
- [ ] Convert images to base64 for API transmission
- [ ] Display image thumbnails in the message history
- [ ] Send as `image` content blocks to Anthropic API / OpenAI vision API
- [ ] Use case: "Make something like this" with a photo/sketch reference
- [ ] Backend change: extend `send_ai_query` message format to support image content blocks

### 5.3: Multi-File Project Context for AI

**Note:** Library path management and `include`/`use` resolution were implemented in v0.7.1 (see Phase 4C). This task now focuses on surfacing that context to the AI agent.

- [x] Parse `use`/`include` statements from current file (done in v0.7.1 render pipeline)
- [x] Resolve referenced files relative to `working_dir` (done in v0.7.1)
- [x] Read referenced file contents and merge into render (done in v0.7.1)
- [ ] Include referenced files in the AI system prompt as context:
  ```
  The user's project includes these files:
  --- utils.scad ---
  [contents]
  --- main.scad (active) ---
  [contents]
  ```
- [ ] Add an `explore_project` AI tool that lists files in the working directory
- [ ] Limit context to files actually referenced (don't dump entire directories)

### 5.4: AI Prompt Templates

- [ ] Create a prompt template system with categories:
  - **Generate**: "Create a parametric enclosure", "Design a gear with N teeth"
  - **Fix**: "Fix compilation errors", "Optimize for 3D printing"
  - **Modify**: "Add fillets to all edges", "Make this parametric", "Add mounting holes"
  - **Explain**: "Explain this code", "What does this module do?"
- [ ] Template picker accessible from AI prompt area (button or `/` command)
- [ ] Templates inject into prompt textarea, user can edit before sending
- [ ] Store templates as JSON in app resources (not user-editable initially)

### 5.5: Configurable Edit Size Limit

- [ ] Move the 120-line edit limit from hardcoded to a setting
- [ ] Default: 120 lines (current behavior)
- [ ] Allow increase to 250 or 500 for users who want full-file generation
- [ ] Setting in `SettingsDialog.tsx` → AI tab
- [ ] Update `validate_edit()` in `ai_tools.rs` to read from settings

**Success criteria:** AI chat renders beautifully. Users can reference images and past conversations. AI understands multi-file projects. Common operations are one-click.

---

## Phase 6: 3D Viewer & CAD Features (~2 weeks)

**Goal:** Make the 3D viewer competitive with dedicated CAD preview tools.

### 6.1: Adaptive Render Resolution

- [ ] Replace hardcoded 800x600 with actual panel dimensions
- [ ] Use `ResizeObserver` on the preview panel to track size
- [ ] Pass dynamic `{ w, h }` to `renderPreview`
- [ ] Cap at 2x device pixel ratio for retina displays
- [ ] Debounce resize-triggered re-renders (300ms)

### 6.2: Section/Clipping Plane

- [ ] Add a toggle button to the 3D viewer toolbar: "Section Plane"
- [ ] When enabled: render a draggable clipping plane using `THREE.Plane`
- [ ] Controls: drag to move plane position, rotate to change orientation
- [ ] Useful for inspecting hollow objects, internal cavities, fit checks
- [ ] Three.js `clippingPlanes` on material is the standard approach

### 6.3: Color Support from OpenSCAD

- [ ] Parse `color()` calls from OpenSCAD source code
- [ ] When rendering STL: OpenSCAD doesn't embed colors, so this requires either:
  - Option A: Use AMF/3MF format (supports colors) for preview instead of STL
  - Option B: Parse color from source and apply to Three.js materials by geometry group
- [ ] Evaluate AMF/3MF support in Three.js loaders
- [ ] Minimum viable: single-color override from first `color()` call in source

### 6.4: Measurement Tools

- [ ] Point-to-point distance measurement:
  - Click two points on the mesh surface
  - Display distance with a line and label
  - Snap to vertices
- [ ] Bounding box dimensions:
  - Toggle to show X/Y/Z extent labels
  - Display total size in current units
- [ ] Three.js raycasting for point picking

### 6.5: Special Operator Preview

- [ ] Support OpenSCAD debug operators: `#` (highlight), `%` (transparent), `*` (disable), `!` (show only)
- [ ] This requires parsing the source for operators and communicating them to the renderer
- [ ] `#` highlighted objects: render with a distinct color/transparency
- [ ] `%` background objects: render with low opacity
- [ ] May require multiple render passes or creative use of OpenSCAD `--colorscheme`

**Success criteria:** Preview adapts to panel size. Users can inspect internal geometry. Measurement tools exist for verifying dimensions.

---

## Phase 7: Editor Intelligence (~1.5 weeks)

**Goal:** Make the code editor smarter than stock OpenSCAD.

### 7.1: Static Linting

- [ ] Implement basic linting rules (no external process needed):
  - Undefined variable references
  - Unused variable warnings
  - Module arity mismatches (wrong number of arguments)
  - Deprecated function usage
- [ ] Use Tree-sitter AST (already available for formatting) for analysis
- [ ] Display as Monaco warning markers (alongside OpenSCAD compile errors)
- [ ] Linting runs on idle (debounced), not on every keystroke

### 7.2: Go-to-Definition

- [ ] `Cmd+Click` / `F12` on module/function names jumps to definition
- [ ] Works within the current file
- [ ] Works across `use`/`include` files (resolve to file, open in new tab)
- [ ] Uses Tree-sitter to find definition sites
- [ ] Register as Monaco `DefinitionProvider`

### 7.3: Hover Documentation

- [ ] Hover over built-in functions (`cube`, `sphere`, `translate`, etc.) shows documentation
- [ ] Include: signature, parameter descriptions, example
- [ ] Source: embed OpenSCAD cheat sheet data as JSON
- [ ] Hover over user-defined modules shows the module signature
- [ ] Register as Monaco `HoverProvider`

### 7.4: Improved Autocomplete

- [ ] Context-aware completions:
  - Inside `translate([...])` → suggest coordinate patterns
  - After `$fn =` → suggest common values (32, 64, 128)
  - Inside `color("...")` → suggest named colors with preview swatches
- [ ] Complete user-defined module and function names
- [ ] Complete variable names from current scope
- [ ] Complete parameter names for known modules
- [ ] Rank by usage frequency

**Success criteria:** Editor catches errors before compilation. Navigation within projects is fast. Autocomplete is genuinely useful beyond snippet insertion.

---

## Phase 8: Cross-Platform & Distribution (~2 weeks)

**Goal:** Ship to real users on all platforms.

### 8.1: Windows Support

- [ ] Test OpenSCAD detection on Windows (`where openscad`, common install paths)
- [ ] Fix path handling (backslashes, drive letters)
- [ ] Verify keyboard shortcuts (Ctrl vs ⌘)
- [ ] MSI installer via Tauri bundler
- [ ] Code signing with Windows certificate
- [ ] Test on Windows 10 and 11

### 8.2: Linux Support

- [ ] Test OpenSCAD detection on Linux (`which openscad`, package manager paths)
- [ ] AppImage build
- [ ] .deb package for Ubuntu/Debian
- [ ] Test on Ubuntu 22.04 and Fedora 39
- [ ] Verify file dialogs work with various desktop environments

### 8.3: Auto-Update

- [ ] Enable Tauri's built-in updater plugin
- [ ] Set up update server (GitHub Releases as update source)
- [ ] In-app update notification: "A new version is available" with changelog
- [ ] One-click update + restart

### ✅ 8.4: CI/CD Pipeline (MOSTLY COMPLETED)

- [x] GitHub Actions workflows:
  - [x] `ci.yml` — lint, type checking, build verification on PRs
  - [x] `e2e.yml` — Playwright E2E tests on PRs
  - [x] `deploy-web.yml` — Cloudflare Pages deployment
  - [x] `release.yml` — Automated macOS release builds on tag push
- [x] Upload artifacts to GitHub Releases
- [ ] Build on Windows and Linux in CI
- [ ] Run `pnpm audit` for dependency security

### ✅ 8.5: E2E Test Suite (COMPLETED)

- [x] Set up Playwright for web app testing
- [x] Global setup/teardown with dev server management
- [x] App fixture with reusable test utilities (`app.fixture.ts`)
- [x] Editor helpers for common interactions (`helpers/editor.ts`)
- [x] AI mock helpers for testing AI chat (`helpers/ai-mock.ts`)
- [x] Platform helpers for OS-aware keyboard shortcuts (`helpers/platform.ts`)
- [x] Critical path tests:
  - [x] Editor basics, formatting, vim mode
  - [x] 2D rendering, 3D rendering, auto-detection, error rendering
  - [x] Include/use resolution and BOSL2 integration
  - [x] File management (new file, open/save for web)
  - [x] Customizer panel, diagnostics panel, panel layout
  - [x] Undo/redo history
  - [x] Keyboard shortcuts, full workflow integration
  - [x] Export formats
  - [x] Settings
  - [x] AI chat (with mocked responses)
  - [x] Multi-tab (Tauri-specific)
- [x] Run in CI on each PR via GitHub Actions (`e2e.yml`)
- [x] Chromium-only in CI (WebKit has clipboard/WebGL compatibility issues)
- [x] Cross-browser considerations handled (WebGL args, clipboard permissions)

**Success criteria:** ✅ CI catches regressions. E2E tests cover all critical paths. macOS release builds are automated. Windows/Linux CI builds remain as follow-up.

---

## ✅ Phase 9: Web Version (COMPLETED)

**Goal:** Run OpenSCAD Studio in the browser with openscad-wasm. See `AGENTS.md` for the current architecture summary.

### ✅ 9.1: Web Platform Implementation

- [x] Create `WebBridge` implementing the `PlatformBridge` interface
- [x] openscad-wasm rendering in a Web Worker
- [x] Port `parseOpenScadStderr()` from Rust to TypeScript
- [x] `WebFileSystemService`: File System Access API + fallbacks
- [x] `WebStorageService`: localStorage
- [x] `WebConversationService`: localStorage
- [x] `WebHistoryService`: in-memory undo/redo

### ✅ 9.2: Web AI Agent

- [x] AI agent using Vercel AI SDK with streaming support
- [x] In-browser tool execution
- [x] API key stored in localStorage with security warning
- [x] Both Anthropic and OpenAI supported

### ✅ 9.3: Web-Specific UI

- [x] Skip `OpenScadSetupScreen` (WASM is always available)
- [x] Export = browser download instead of file save dialog
- [x] Tab title shows "OpenSCAD Studio" via `document.title`
- [x] `beforeunload` handler for unsaved changes
- [x] Error boundary for crash recovery
- [x] Loading screen with browser compatibility check

### ✅ 9.4: Build & Deploy

- [x] Separate `apps/web/` entry point with Vite config
- [x] `pnpm web:dev` and `pnpm web:build` scripts
- [x] Deploy to Cloudflare Pages at openscad-studio.pages.dev
- [x] Loading screen while openscad-wasm downloads (~3-4MB compressed)
- [x] COOP/COEP headers for SharedArrayBuffer support
- [x] PWA manifest and favicons

**Completed:** February 2026 (v0.7.0)
**Live at:** https://openscad-studio.pages.dev
**Success criteria:** ✅ Full workflow works in Chrome: edit → preview → export → AI chat. Desktop has zero regressions.

---

## Phase 10: Advanced Features (Post-1.0)

These are valuable but not blocking a production release. Prioritize based on user feedback.

### Community & Sharing

- [ ] Share designs via URL (encode source as URL parameter or pastebin-style)
- [ ] Gallery of example designs with one-click open
- [ ] Community prompt library (submit/upvote prompt templates)

### Offline LLM

- [ ] Integrate llama.cpp as Tauri sidecar
- [ ] Model download/management UI
- [ ] Offline mode toggle (no network required)
- [ ] Fine-tuned model on OpenSCAD code corpus

### Plugin System

- [ ] Plugin API for custom tools, exporters, and UI panels
- [ ] Plugin manifest format and loader
- [ ] Community plugin registry

### Performance

- [ ] Incremental rendering (re-render only changed subtree)
- [ ] Background render thread pool
- [ ] GPU-accelerated preview (consider WebGPU for web)
- [ ] Render progress indicator for complex models (>5s)

### Collaboration

- [ ] Real-time collaborative editing (CRDT via Yjs)
- [ ] Shareable project URLs
- [ ] Comments/annotations on 3D model

---

## Known Technical Debt

Items to address opportunistically, not as dedicated phases:

| Issue                                                 | Location                           | Severity | Notes                                                                       |
| ----------------------------------------------------- | ---------------------------------- | -------- | --------------------------------------------------------------------------- |
| Refs-as-state anti-pattern                            | `App.tsx` (7+ refs)                | Medium   | Address in 4B.1 decomposition                                               |
| Settings split across localStorage and Tauri store    | `settingsStore.ts`, `cmd/ai.rs`    | Low      | Consider unifying in platform abstraction                                   |
| OpenSCAD stderr parsing is regex-based                | `utils/parser.rs`                  | Low      | Works but may miss edge cases. Revisit if OpenSCAD adds JSON output         |
| `EditorState` duplicated between frontend and backend | `useOpenScad.ts`, `ai_agent.rs`    | Medium   | Backend should be source of truth (4B.3)                                    |
| No graceful degradation when OpenSCAD is unavailable  | Various                            | Low      | Editor works, just no preview. Could be clearer about what's disabled       |
| `DiffViewer` panel always shows same code for old/new | `PanelComponents.tsx:58-66`        | Low      | `oldCode={source} newCode={source}` — not actually showing a diff           |
| Error boundary only at top level                      | `ErrorBoundary.tsx`                | Low      | Per-panel boundaries would improve resilience (see 4B.2 follow-up)          |
| Parser race condition fixed but fragile               | `CustomizerPanel.tsx`, `parser.ts` | Low      | Parser-ready signaling added; consider a more robust initialization pattern |

---

## Design Decisions & Tradeoffs

### Key Architectural Choices

1. **Headless OpenSCAD**: Invoke as CLI subprocess rather than linking as library
   - ✅ Avoids GPL licensing complications
   - ✅ Works with any OpenSCAD installation
   - ⚠️ Slower than in-process rendering

2. **PNG-first preview**: Fast raster output while typing, STL for interaction
   - ✅ Instant feedback (< 1s for simple shapes)
   - ✅ No GPU required for basic editing
   - ⚠️ Not interactive until STL export

3. **Exact string replacement edits**: Agent provides precise changes
   - ✅ Exact match validation (old_string must be unique)
   - ✅ Atomic apply/rollback with validation
   - ✅ Smaller token usage (max 120 lines)
   - ✅ Preserves user code structure
   - ✅ Test-compiled before acceptance

4. **Monorepo with pnpm**: Shared types between frontend/backend
   - ✅ Type safety across IPC boundary
   - ✅ Easy to version/publish shared package
   - ⚠️ More complex build setup

### Performance Targets

- **Preview latency**: < 500ms for simple shapes (cube, sphere)
- **Editor responsiveness**: < 100ms keystroke to screen
- **LLM response**: < 10s for typical code generation
- **Startup time**: < 2s to interactive

---

## Decision Log

Decisions made during roadmap planning that affect ordering:

1. **Auto-render defaults to off.** The stock OpenSCAD editor auto-renders, but for large models this causes constant lag. Making it opt-in avoids perf regressions for power users.

2. **Web version shipped before cross-platform desktop.** Contrary to original plan, the web version (Phase 9) shipped first in v0.7.0. This proved to be the right call — it lowered the barrier to entry dramatically. Windows/Linux desktop support remains in Phase 8.

3. **AI features before CAD viewer features.** The 3D viewer is functional. The AI copilot is the differentiator. Invest where the moat is.

4. **Platform abstraction completed.** The `PlatformBridge` interface shipped as part of the web version work. `TauriBridge` and `WebBridge` both implement it. This was validated as the right architectural call — library management in v0.7.1 was able to extend the bridge interface cleanly.

5. **No collaborative editing before 1.0.** CRDT/Yjs is a massive undertaking. It's not what users are asking for first. Save it for post-1.0 when there's a user base that wants to share.

6. **E2E tests before more features.** Investing in a comprehensive Playwright test suite before building new features ensures regressions are caught early. The ~2700-line test suite covers all critical paths.

7. **Library management before AI multi-file context.** Building `include`/`use` resolution at the render pipeline level first means the AI can later leverage the same infrastructure for project context, rather than duplicating resolution logic.

---

**Last Updated:** 2026-04-19
**Current Phase:** v1.2.1 — web + desktop app shipping with sharing, analytics/privacy controls, formatter coverage, advanced viewer tooling, and desktop MCP support for external agents
**Next Milestone:** Phase 4B.1/4B.3 (App.tsx decomposition, centralized state) or Phase 5 (AI experience) based on user feedback
