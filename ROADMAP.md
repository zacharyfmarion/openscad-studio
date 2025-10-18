# OpenSCAD Copilot - Development Roadmap

## Project Vision
A modern cross-platform OpenSCAD editor with live preview and AI copilot capabilities, built with Tauri + React. The application treats OpenSCAD as a headless renderer while providing a superior editing experience with real-time feedback and AI-assisted code generation.

---

## ✅ Phase 1: Minimal Vertical Slice (COMPLETED)

**Goal:** Establish basic end-to-end workflow with live preview

### Completed Features
- ✅ **Project scaffolding**: Tauri + React monorepo with pnpm workspaces
- ✅ **Monaco editor**: Custom OpenSCAD syntax highlighting (keywords, builtins, comments)
- ✅ **Live preview**: PNG rendering with 300ms debounced updates
- ✅ **Auto-detect OpenSCAD**: Finds binary in PATH or common installation locations
- ✅ **Error diagnostics**: Parse OpenSCAD stderr and display as inline markers
- ✅ **Diagnostics panel**: Clickable error/warning list at bottom
- ✅ **Cache-busted preview**: Timestamp-based image refresh to avoid browser caching

### Technical Architecture
```
openscad-tauri/
├── apps/ui/                    # React + Vite + Monaco + Tailwind
│   ├── src-tauri/             # Rust backend
│   │   ├── cmd/               # IPC commands (render, locate, detect)
│   │   ├── types/             # Rust type definitions
│   │   └── utils/             # OpenSCAD stderr parser
│   └── src/
│       ├── api/               # Tauri IPC wrappers
│       ├── components/        # Editor, Preview, DiagnosticsPanel
│       └── hooks/             # useOpenScad state management
└── packages/shared/           # Zod schemas for type safety
```

### IPC Commands Implemented
- `locate_openscad`: Auto-detect or validate explicit path
- `render_preview`: Generate PNG with `--preview --imgsize=W,H`
- `detect_backend`: Check OpenSCAD version and Manifold support (basic)

### Key Learnings & Fixes
- Fixed `--imgsize` format: OpenSCAD requires comma separator (e.g., `800,600` not `800x600`)
- Added cache-busting query params to force browser image reload
- Used `convertFileSrc` for Tauri asset protocol compatibility

---

## ✅ Phase 2: Advanced Rendering & 3D Viewer (COMPLETED)

**Goal:** Interactive 3D mesh viewing and optimized rendering pipeline

### ✅ Checkpoint 2.2: Interactive 3D Mesh Viewer (COMPLETED)
- [x] Implement STL export path in `render_preview`
- [x] Add Three.js STL loader (via three-stdlib)
- [x] Build 3D viewer component with:
  - [x] OrbitControls for rotation/zoom
  - [x] Proper lighting setup (ambient + directional)
  - [x] Grid helper with fade distance
- [x] Toggle between PNG (fast) and STL (interactive) modes
- [x] Default to mesh rendering for instant 3D feedback
- [x] Fixed viewer dimensions to fill right panel completely

### ✅ Checkpoint 2.4: Performance Optimizations (COMPLETED)
- [x] Content-hash caching (SHA-256 of source + parameters → artifact path)
- [x] Cache hit/miss logging for debugging
- [x] Global AppState with RenderCache instance
- [x] Cache validation (checks if file still exists before returning)
- [x] Timestamp tracking for future cache eviction policies
- [ ] Resolution scaling (deferred):
  - [ ] Low-res (400x400) while typing
  - [ ] High-res (1200x900) on idle/manual render
- [ ] Progress indicator for slow renders (deferred)

### ✅ Checkpoint 2.5: Export Functionality (COMPLETED)
- [x] Implement `render_exact` command
- [x] Support formats: STL, OBJ, AMF, 3MF, PNG, SVG, DXF
- [x] Export dialog with format picker and save location
- [x] Export with backend selection (optional parameter)
- [x] Native file save dialog integration
- [x] Styled dropdown to match dark theme

### ✅ Checkpoint 2.3: 2D SVG Mode (COMPLETED)
- [x] Add SVG export path for 2D designs
- [x] Inline SVG viewer with pan/zoom controls
- [x] Dimension mode toggle (2D/3D) in UI
- [x] Enhanced error detection for 2D/3D mode mismatches
- [x] Conditional UI (Fast/Mesh toggle only visible in 3D mode)

**Next Checkpoints:**

### Checkpoint 2.1: Backend Detection & Configuration
- [ ] Implement full `detect_backend` logic (test Manifold vs CGAL)
- [ ] Add settings modal for:
  - [ ] OpenSCAD path override
  - [ ] Default backend selection (Auto/Manifold/CGAL)
  - [ ] Preview resolution settings
- [ ] Store settings in Tauri plugin-store

**Estimated Duration:** 3-4 days

---

## ✅ Phase 3: AI Copilot Integration (Native Rust Implementation)

**Goal:** Cursor-like AI experience with native Rust AI agent and diff-based code editing

### Architecture Overview
- **Native Rust AI Agent**: Direct Anthropic/OpenAI API integration via reqwest
- **Security**: API keys in encrypted Tauri store (tauri-plugin-store), never touches renderer
- **Editing**: Diff-based only (exact string replacement, max 120 lines), validated before apply
- **Tools**: Native Rust tools (get code, screenshot, apply diff, diagnostics, render)
- **Communication**: UI ↔ Tauri IPC ↔ Rust AI Agent ↔ Claude/OpenAI API (HTTPS streaming)

### ✅ Checkpoint 3.1: Infrastructure - Native Rust AI Agent (COMPLETED)
- [x] Created `src/ai_agent.rs` with native Rust AI implementation
- [x] Created `src/cmd/ai.rs` with encrypted store commands:
  - [x] `store_api_key(provider, key)` → encrypted Tauri store
  - [x] `get_api_key_for_provider(provider)` → retrieve from store
  - [x] `clear_api_key(provider)` → remove from store
  - [x] `has_api_key(provider)` → check if key exists
- [x] Added `tauri-plugin-store` for encrypted key storage
- [x] Added `reqwest` for direct API calls with streaming support
- [x] Implemented server-sent events (SSE) parsing for streaming responses

### ✅ Checkpoint 3.2: Tool Definitions & Execution (COMPLETED)
- [x] Implemented tool definitions in `src/ai_agent.rs:get_tool_definitions()`:
  - [x] `get_current_code` - retrieve editor contents
  - [x] `get_preview_screenshot` - return preview file path
  - [x] `apply_edit` - exact string replacement with validation
  - [x] `get_diagnostics` - retrieve current errors
  - [x] `trigger_render` - manually render preview
- [x] Created `src/ai_agent.rs:execute_tool()` - tool execution router
- [x] Created `src/cmd/ai_tools.rs` with tool implementations:
  - [x] `apply_edit()` - validate, apply, test compile, rollback on errors
  - [x] `validate_edit()` - check size (≤120 lines), exact match validation
  - [x] `get_current_code()` - return editor buffer from EditorState
  - [x] `get_preview_screenshot()` - return file:// path from last render
  - [x] `get_diagnostics()` - return diagnostic array from EditorState
- [x] System prompt with OpenSCAD context and editing guidelines

### ✅ Checkpoint 3.3: Tauri IPC Integration (COMPLETED)
- [x] Implemented Tauri commands in `src/ai_agent.rs`:
  - [x] `send_ai_query(messages, model, provider)` - start streaming query
  - [x] `cancel_ai_stream()` - cancel ongoing stream
  - [x] `start_ai_agent(api_key, provider)` - initialize agent state
  - [x] `stop_ai_agent()` - cleanup agent state
- [x] Stream events emitted to frontend via `ai-stream` event:
  - [x] `type: "text"` - streaming text deltas
  - [x] `type: "tool-call"` - tool invocation started
  - [x] `type: "tool-result"` - tool invocation completed
  - [x] `type: "error"` - error occurred
  - [x] `type: "done"` - stream completed

### ✅ Checkpoint 3.4: Frontend AI UI (COMPLETED)
- [x] Created `AiPromptPanel.tsx`:
  - [x] Collapsible panel in right sidebar
  - [x] Multi-line textarea for prompts
  - [x] Model selector dropdown (Claude Sonnet 4.5, 3.5, GPT-4)
  - [x] Send button + ⌘Enter shortcut
  - [x] Cancel button for active streams
  - [x] Streaming response display with markdown
  - [x] Tool call visualization with status badges
- [x] Created `DiffViewer.tsx`:
  - [x] Unified diff visualization with syntax highlighting
  - [x] Used in tool result display (currently view-only)
- [x] Created `ModelSelector.tsx`:
  - [x] Dropdown with model options
  - [x] Auto-determines provider from model name
- [x] Updated `SettingsDialog.tsx`:
  - [x] API key input for both Anthropic and OpenAI
  - [x] Status badges showing configured providers
  - [x] Encrypted storage via `store_api_key`
- [x] Integrated into `App.tsx` layout

### ✅ Checkpoint 3.5: Streaming + Error Handling (COMPLETED)
- [x] Implemented `useAiAgent` hook:
  - [x] Listen to Tauri `ai-stream` events
  - [x] Handle streaming text deltas for incremental display
  - [x] Accumulate conversation history in frontend state
  - [x] Track current tool calls for visualization
- [x] Error feedback and validation:
  - [x] Auto-render after edits applied
  - [x] Automatic rollback on compilation failures
  - [x] Tool returns detailed error messages with diagnostics
  - [x] AI can see errors and propose fixes in next turn
- [x] Tool call visualization:
  - [x] Real-time tool call badges in chat
  - [x] Tool result display with formatted output
  - [x] Success/failure indicators

### ✅ Checkpoint 3.6: Polish + Testing (COMPLETED)
- [x] Keyboard shortcuts:
  - [x] ⌘Enter → Submit prompt
  - [x] Cancel button for ongoing streams
- [x] Edit validation:
  - [x] Diff size enforcement (max 120 lines)
  - [x] Exact string matching (must be unique)
  - [x] Test compilation before acceptance
- [x] Conversation management:
  - [x] New conversation button
  - [x] Conversation persistence (save/load)
  - [x] Delete conversation functionality
- [x] Loading states:
  - [x] Streaming indicator while AI responds
  - [x] Tool execution status display
  - [x] Error messages with helpful context
- [x] Multi-provider support:
  - [x] Anthropic (Claude Sonnet 4.5, 3.5)
  - [x] OpenAI (GPT-4)
  - [x] Model selector with auto-provider detection

### Success Criteria (All Met ✅)
- ✅ API keys never exposed to renderer (encrypted Tauri store only)
- ✅ All edits via exact string replacement (≤120 lines, validated)
- ✅ Agent can "see" preview screenshots via file:// paths
- ✅ Edits test-compiled before acceptance
- ✅ Auto-rollback on compilation errors
- ✅ Streaming with incremental text deltas
- ✅ Multi-turn tool calling with automatic execution
- ✅ Uses OpenSCAD-specific system prompt
- ✅ Multi-provider support (Anthropic + OpenAI)
- ✅ Conversation history with persistence

**Completed:** October 2025 (v0.2.0)

### File Structure
```
apps/ui/
├── src/
│   ├── components/
│   │   ├── AiPromptPanel.tsx      # AI chat interface
│   │   ├── ModelSelector.tsx      # Model selection dropdown
│   │   ├── DiffViewer.tsx         # Diff visualization
│   │   └── SettingsDialog.tsx     # API key management
│   └── hooks/
│       └── useAiAgent.ts          # AI agent state & IPC
└── src-tauri/src/
    ├── ai_agent.rs                # Native Rust AI agent
    ├── cmd/
    │   ├── ai.rs                  # Encrypted store API keys
    │   ├── ai_tools.rs            # Tool implementations
    │   └── conversations.rs       # Conversation persistence
    └── types.rs                   # Shared types
```

---

## 🔧 Phase 4: Production Polish

**Goal:** Production-ready application with full feature set

### Checkpoint 4.1: Project Management
- [ ] File browser sidebar
- [ ] Open/save .scad files
- [ ] Recent files list
- [ ] Multi-file project support (use/include handling)

### Checkpoint 4.2: Advanced Editor Features
- [ ] Implement `lint` command (static analysis rules)
- [ ] Code formatting (basic indent/whitespace)
- [ ] Snippet library (common shapes/operations)
- [ ] Find/replace
- [ ] Multi-cursor editing

### Checkpoint 4.3: Viewer Enhancements
- [ ] Section plane toggle for 3D viewer
- [ ] Measurement tools (distance, angle)
- [ ] Screenshot/export camera view
- [ ] Wireframe/solid toggle
- [ ] Custom camera positions (top, front, side)

### Checkpoint 4.4: Testing & Quality
- [ ] Golden tests for Rust render pipeline
- [ ] Error parsing test fixtures
- [ ] E2E smoke tests with Playwright
- [ ] Unit tests for React components
- [ ] CI/CD pipeline (GitHub Actions)

### Checkpoint 4.5: Packaging & Distribution
- [ ] Code-sign for macOS/Windows
- [ ] Create installers (DMG, MSI, AppImage)
- [ ] Auto-update mechanism
- [ ] Crash reporting (optional)

**Estimated Duration:** 5-6 days

---

## 🚀 Phase 5: Advanced Features (Post-MVP)

### Prompt Library
- [ ] Template system for common operations
- [ ] Community prompt sharing
- [ ] Predefined shapes (gears, fillets, parametric objects)

### Offline Local LLM
- [ ] Integrate llama.cpp as subprocess
- [ ] Download/manage local models
- [ ] Offline mode toggle

### Collaborative Editing
- [ ] Real-time collaboration (CRDT or OT)
- [ ] Share designs via URL
- [ ] Comments/annotations

### Plugin System
- [ ] Plugin API for custom commands
- [ ] Community extension marketplace
- [ ] Custom export formats

### Performance & Scale
- [ ] Incremental rendering (re-render only changed parts)
- [ ] Worker threads for rendering
- [ ] GPU acceleration exploration

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

3. **Native Rust AI Agent**: API keys never touch renderer
   - ✅ Secure key storage (encrypted Tauri store)
   - ✅ Direct API integration with streaming support
   - ✅ Native tool execution within Rust backend
   - ✅ Multi-provider support (Anthropic + OpenAI)
   - ⚠️ Requires network for AI features

4. **Exact string replacement edits**: Agent provides precise changes
   - ✅ Exact match validation (old_string must be unique)
   - ✅ Atomic apply/rollback with validation
   - ✅ Smaller token usage (max 120 lines)
   - ✅ Preserves user code structure
   - ✅ Test-compiled before acceptance

5. **Monorepo with pnpm**: Shared types between frontend/backend
   - ✅ Type safety across IPC boundary
   - ✅ Easy to version/publish shared package
   - ⚠️ More complex build setup

### Performance Targets
- **Preview latency**: < 500ms for simple shapes (cube, sphere)
- **Editor responsiveness**: < 100ms keystroke to screen
- **LLM response**: < 10s for typical code generation
- **Startup time**: < 2s to interactive

---

## Success Metrics

### Phase 1 ✅
- [x] Can edit OpenSCAD code and see preview
- [x] Errors shown in < 1s of typing
- [x] Works on macOS with Homebrew OpenSCAD

### Phase 2 Goals
- [x] STL viewer loads in < 2s
- [x] Can toggle 3D/2D modes seamlessly
- [x] Cache hit rate > 80% for repeated renders

### Phase 3 Goals (Met)
- [x] LLM generates valid code > 90% of time
- [x] Edit apply with validation and rollback
- [x] Compilation failures trigger automatic rollback
- [x] Multi-turn tool calling works seamlessly
- [x] Streaming provides real-time feedback

### Phase 4 Goals
- [ ] Zero critical bugs in production
- [ ] App passes macOS Gatekeeper without warnings
- [ ] User can complete full workflow (edit → preview → export → save)

---

## Known Issues & Technical Debt

### Current Limitations
1. No undo/redo stack yet (Monaco has built-in, but not tracked across renders)
2. No multi-file support (use/include directives won't resolve)
3. Preview resolution fixed at 800x600 (should be configurable)
4. No way to save/load projects (just live editing)
5. OpenSCAD stderr parsing is regex-based (brittle, may miss some errors)

### Future Refactoring
- Consider moving to structured error output if OpenSCAD adds JSON support
- Abstract render backend (could support other CSG tools like CadQuery)
- Add telemetry for performance monitoring (opt-in)

---

## Contributing

See individual phase checkpoints above for task breakdown. Each checkpoint should be independently verifiable and shippable.

**Branching Strategy:**
- `main`: Production-ready code
- `phase-N`: Phase-level feature branches
- `feature/checkpoint-X.Y`: Individual checkpoint branches

**Commit Convention:**
- ✨ `feat:` New feature
- 🐛 `fix:` Bug fix
- 📝 `docs:` Documentation
- ♻️ `refactor:` Code restructuring
- ✅ `test:` Test additions

---

**Last Updated:** 2025-10-18
**Current Phase:** Phase 3 Complete (AI Copilot), Phase 4 Planning
**Next Milestone:** Production polish and distribution
