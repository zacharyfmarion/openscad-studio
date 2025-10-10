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

## 🚧 Phase 2: Advanced Rendering & 3D Viewer (IN PROGRESS)

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

## 🎯 Phase 3: AI Copilot Integration (Claude Agent SDK + Sidecar)

**Goal:** Cursor-like AI experience with secure sidecar architecture and diff-based code editing

### Architecture Overview
- **Agent SDK Sidecar**: Node/Bun process running `@anthropic-ai/claude-agent-sdk`
- **Security**: API key in OS keychain, injected to sidecar via env, never touches renderer
- **Editing**: Diff-based only (unified diff format, max 120 lines), validated before apply
- **Tools**: MCP server with OpenSCAD-specific tools (get code, screenshot, apply diff, diagnostics)
- **Communication**: UI ↔ Tauri IPC ↔ Sidecar (stdio) ↔ Agent SDK ↔ Claude API

### Checkpoint 3.1: Infrastructure - Sidecar + Keychain (2 days)
- [ ] Add `keyring = "2"` to Cargo.toml
- [ ] Create `src/cmd/ai.rs` with keychain commands:
  - [ ] `store_api_key(key)` → OS keychain
  - [ ] `get_api_key()` → retrieve from keychain
  - [ ] `clear_api_key()` → remove from keychain
- [ ] Create `src/agent_sidecar.rs` - sidecar process manager
  - [ ] Spawn Node/Bun with API key in env
  - [ ] JSON-RPC over stdio communication
  - [ ] Graceful shutdown handling
- [ ] Create sidecar workspace: `apps/sidecar/`
  - [ ] Add `@anthropic-ai/claude-agent-sdk` dependency
  - [ ] Setup esbuild for bundling
  - [ ] Add to root build scripts

### Checkpoint 3.2: Diff-Based MCP Tools (2-3 days)
- [ ] Create `apps/sidecar/src/agent-server.ts`:
  - [ ] Define MCP tools using SDK's `tool()` API
  - [ ] `get_current_code` - retrieve editor contents
  - [ ] `get_preview_screenshot` - return preview file path
  - [ ] `propose_diff` - validate unified diff format
  - [ ] `apply_diff` - apply & test-compile diff
  - [ ] `get_diagnostics` - retrieve current errors
  - [ ] `trigger_render` - manually render preview
  - [ ] Create MCP server with `createSdkMcpServer()`
- [ ] Create `apps/ui/src-tauri/src/cmd/ai_tools.rs`:
  - [ ] `validate_diff(diff)` - check size (≤120 lines), dry-run apply
  - [ ] `apply_diff(diff)` - apply patch, test compile, rollback on errors
  - [ ] `get_current_code()` - return editor buffer
  - [ ] `get_preview_screenshot()` - return file:// path (not base64)
  - [ ] `get_diagnostics()` - return diagnostic array
- [ ] System prompt with Claude Code preset + OpenSCAD context

### Checkpoint 3.3: Tauri IPC Bridge (1 day)
- [ ] Extend `agent_sidecar.rs` with JSON-RPC bridge
- [ ] Add Tauri commands:
  - [ ] `agent_query_stream(prompt, mode)` - start agent session
  - [ ] `agent_interrupt()` - cancel ongoing query
  - [ ] `agent_status()` - get sidecar health
- [ ] Stream SDK messages to frontend via Tauri events
- [ ] Handle `SDKMessage` types: assistant, partial, result, system

### Checkpoint 3.4: Frontend AI UI (2 days)
- [ ] Create `AiPromptPanel.tsx`:
  - [ ] Collapsible bottom panel (stacked with DiagnosticsPanel)
  - [ ] Multi-line textarea for prompts
  - [ ] Mode selector: Generate | Edit | Fix | Explain
  - [ ] "Ask AI" button + ⌘K shortcut
  - [ ] Cancel button for active streams
  - [ ] Streaming response display with markdown
- [ ] Create `DiffViewer.tsx`:
  - [ ] Unified diff visualization with syntax highlighting
  - [ ] Side-by-side or inline view toggle
  - [ ] Accept/Reject buttons
  - [ ] Show lines changed count
- [ ] Create `SettingsDialog.tsx`:
  - [ ] API key input (calls `store_api_key`)
  - [ ] Model selection (Sonnet 4.5, 3.5 Sonnet fallback)
  - [ ] Test connection button
- [ ] Integrate into `App.tsx` layout

### Checkpoint 3.5: Streaming + Error Handling (1 day)
- [ ] Implement `useAiStream` hook:
  - [ ] Listen to Tauri 'agent-message' events
  - [ ] Handle `SDKPartialAssistantMessage` for typing animation
  - [ ] Fallback to `SDKResultMessage.result` for missing text (streaming bug workaround)
  - [ ] Accumulate conversation history (last 5 exchanges)
- [ ] Error feedback loop:
  - [ ] Auto-render after diff applied
  - [ ] If new errors, send diagnostics back to agent in "fix" mode
  - [ ] Rollback on validation failure
- [ ] Tool call visualization in UI (show when agent uses tools)

### Checkpoint 3.6: Polish + Testing (1 day)
- [ ] Keyboard shortcuts:
  - [ ] ⌘K / Ctrl+K → Focus AI prompt
  - [ ] ⌘Enter → Submit prompt
  - [ ] Escape → Cancel stream
- [ ] Diff size enforcement (max 120 lines)
- [ ] File whitelist (current editor file only)
- [ ] Conversation history UI (clear button)
- [ ] Loading states and error messages
- [ ] Test end-to-end: Generate → Edit → Fix → Explain modes

### Success Criteria
- ✅ API key never exposed to renderer (keychain + sidecar env only)
- ✅ All edits via unified diffs (≤120 lines, validated)
- ✅ Agent can "see" preview screenshots
- ✅ Diffs test-compiled before acceptance
- ✅ Auto-rollback on compilation errors
- ✅ Streaming with partial messages + result fallback
- ✅ Accept/Reject diff workflow
- ✅ Uses Claude Code preset system prompt
- ✅ Multiple modes working

**Estimated Duration:** 7-10 days

### File Structure Changes
```
apps/
├── sidecar/                  [NEW]
│   ├── src/
│   │   └── agent-server.ts   # Agent SDK + MCP tools
│   ├── package.json
│   └── tsconfig.json
├── ui/
│   ├── src/
│   │   ├── components/
│   │   │   ├── AiPromptPanel.tsx     [NEW]
│   │   │   ├── DiffViewer.tsx        [NEW]
│   │   │   └── SettingsDialog.tsx    [NEW]
│   │   └── hooks/
│   │       └── useAiStream.ts        [NEW]
│   └── src-tauri/
│       └── src/
│           ├── cmd/
│           │   ├── ai.rs             [NEW - keychain]
│           │   └── ai_tools.rs       [NEW - diff tools]
│           └── agent_sidecar.rs      [NEW - sidecar manager]
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

3. **Sidecar Agent SDK**: API keys never touch renderer
   - ✅ Secure key storage (OS keychain)
   - ✅ Node/Bun sidecar with env key injection
   - ✅ Claude Agent SDK with MCP tools
   - ⚠️ Requires network for AI features

4. **Diff-based edits**: Agent returns unified diffs, not full files
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

### Phase 3 Goals
- [ ] LLM generates valid code > 90% of time
- [ ] Diff apply success rate > 95%
- [ ] < 5% rollbacks due to compilation failures

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

**Last Updated:** 2025-10-10
**Current Phase:** Phase 3 (AI Copilot - Sidecar Architecture)
**Next Milestone:** Checkpoint 3.1 - Infrastructure setup
