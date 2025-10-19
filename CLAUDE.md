# Claude.md - AI Assistant Guide for OpenSCAD Studio

This document helps AI assistants (like Claude) understand the OpenSCAD Studio codebase and work effectively on it.

## Project Overview

**OpenSCAD Studio** is a modern cross-platform OpenSCAD editor with live preview and AI copilot capabilities, built with Tauri + React. It treats OpenSCAD as a headless renderer while providing a superior editing experience with real-time feedback and AI-assisted code generation.

**Tech Stack:**
- **Frontend**: React 19 + TypeScript + Vite + Monaco Editor
- **Backend**: Rust + Tauri (IPC-based architecture)
- **AI Agent**: Native Rust with direct Anthropic/OpenAI API integration
- **Package Manager**: pnpm (monorepo workspace)

## Architecture

### High-Level Structure

```
openscad-tauri/
├── apps/
│   ├── ui/                         # Main Tauri application
│   │   ├── src/                    # React frontend
│   │   │   ├── api/                # Tauri IPC wrappers (tauri.ts)
│   │   │   ├── components/         # React components
│   │   │   │   ├── Editor.tsx      # Monaco code editor
│   │   │   │   ├── Preview.tsx     # Preview pane (PNG/STL/SVG)
│   │   │   │   ├── ThreeViewer.tsx # 3D mesh viewer
│   │   │   │   ├── AiPromptPanel.tsx # AI chat interface
│   │   │   │   ├── DiffViewer.tsx  # Code diff visualization
│   │   │   │   └── ...
│   │   │   ├── hooks/              # Custom React hooks
│   │   │   │   ├── useOpenScad.ts  # Rendering state management
│   │   │   │   └── useAiAgent.ts   # AI agent communication
│   │   │   ├── stores/             # Zustand stores
│   │   │   ├── themes/             # Theme definitions
│   │   │   └── utils/              # Utility functions
│   │   └── src-tauri/              # Rust backend
│   │       ├── src/
│   │       │   ├── cmd/            # Tauri commands
│   │       │   │   ├── render.rs   # OpenSCAD rendering
│   │       │   │   ├── locate.rs   # OpenSCAD binary detection
│   │       │   │   ├── ai.rs       # Encrypted store API key storage
│   │       │   │   ├── ai_tools.rs # AI tool handlers (diff apply, etc.)
│   │       │   │   └── conversations.rs # Conversation management
│   │       │   ├── ai_agent.rs     # Native Rust AI agent (direct API)
│   │       │   ├── types.rs        # Rust type definitions
│   │       │   └── utils/          # Utilities (parser, cache)
│   │       └── Cargo.toml
└── packages/
    └── shared/                     # Shared TypeScript types (Zod schemas)
```

### Communication Flow

```
User Input
    ↓
React Frontend (TypeScript)
    ↓ (Tauri IPC)
Rust Backend (Tauri Commands + AI Agent)
    ↓ (HTTPS)
Anthropic API (Claude)
```

### Key Design Patterns

1. **Headless OpenSCAD**: OpenSCAD runs as a CLI subprocess, not linked as a library. This avoids GPL complications and works with any OpenSCAD installation.

2. **Multi-format Preview**:
   - Fast PNG preview while typing (< 500ms)
   - Interactive STL/3D mesh for manipulation
   - SVG for 2D designs

3. **Secure AI Integration**: API keys stored in encrypted Tauri store (tauri-plugin-store), accessed only by backend Rust code, never exposed to renderer process.

4. **Diff-based AI Editing**: AI returns exact string replacements (max 120 lines), not full file rewrites. Changes are test-compiled before acceptance.

5. **Content-hash Caching**: SHA-256 of source + params → cached artifact path. Avoids redundant renders.

## Important Files

### Frontend (React)

- **`apps/ui/src/App.tsx`**: Main application component. Handles tab management, menu events, keyboard shortcuts, file I/O, and layout.
- **`apps/ui/src/hooks/useOpenScad.ts`**: Core rendering logic. Manages OpenSCAD subprocess execution, debouncing, diagnostics parsing.
- **`apps/ui/src/hooks/useAiAgent.ts`**: AI agent communication. Handles streaming responses, diff proposals, tool call visualization.
- **`apps/ui/src/components/Editor.tsx`**: Monaco editor wrapper with OpenSCAD syntax highlighting.
- **`apps/ui/src/components/Preview.tsx`**: Conditional preview renderer (PNG/STL/SVG).
- **`apps/ui/src/components/AiPromptPanel.tsx`**: AI chat interface with mode selection (Generate/Edit/Fix/Explain).
- **`apps/ui/src/api/tauri.ts`**: Typed wrappers for all Tauri commands.

### Backend (Rust)

- **`apps/ui/src-tauri/src/lib.rs`**: Tauri app initialization, command registration.
- **`apps/ui/src-tauri/src/cmd/render.rs`**: `render_preview` and `render_exact` commands. Spawns OpenSCAD, parses stderr, manages temp files.
- **`apps/ui/src-tauri/src/cmd/ai_tools.rs`**: AI tool handlers (`apply_edit`, `get_current_code`, `get_diagnostics`, etc.)
- **`apps/ui/src-tauri/src/ai_agent.rs`**: Native Rust AI agent with direct Anthropic API integration, streaming support, and tool calling.
- **`apps/ui/src-tauri/src/utils/parser.rs`**: OpenSCAD stderr parser (regex-based diagnostics extraction).
- **`apps/ui/src-tauri/src/utils/cache.rs`**: Content-hash based render cache with validation.

## Development Workflow

### Prerequisites

1. **OpenSCAD** installed and in PATH: `brew install openscad` (macOS)
2. **pnpm**: `npm install -g pnpm`
3. **Rust** toolchain: `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`

### Running the App

```bash
# Install dependencies
pnpm install

# Development mode (with hot reload)
pnpm tauri:dev

# Build for production
pnpm tauri:build
```

### Project Scripts

```bash
pnpm dev                # Run UI dev server only
pnpm build              # Build all packages
pnpm tauri:dev          # Run Tauri app in dev mode
pnpm tauri:build        # Build production app
pnpm lint               # Lint all workspaces
pnpm type-check         # Type check all workspaces
```

## Common Tasks

### Adding a New Tauri Command

1. Define command in Rust: `apps/ui/src-tauri/src/cmd/your_module.rs`
2. Register in `apps/ui/src-tauri/src/lib.rs`: `.invoke_handler(...)`
3. Add TypeScript wrapper in `apps/ui/src/api/tauri.ts`
4. Use from React: `import { yourCommand } from './api/tauri'`

### Adding a New AI Tool

1. Add tool definition in `apps/ui/src-tauri/src/ai_agent.rs` (`get_tool_definitions()` function)
2. Implement handler function in the `execute_tool()` match statement
3. Add Rust command handler in `apps/ui/src-tauri/src/cmd/ai_tools.rs` if needed
4. Update system prompt in `build_system_prompt()` if needed

### Modifying the OpenSCAD Parser

- Edit `apps/ui/src-tauri/src/utils/parser.rs`
- Regex patterns match OpenSCAD stderr format: `ERROR: ... in file ..., line N`
- Returns `Vec<Diagnostic>` with line, column, severity, message

### Changing the Theme

- Edit or add theme in `apps/ui/src/themes/index.ts`
- Themes use CSS custom properties for easy switching
- Applied in `App.tsx` via `applyTheme()`

## Important Constraints

### Security

- **API keys**: NEVER store API keys in localStorage or renderer process. Use encrypted Tauri store (tauri-plugin-store).
- **Backend isolation**: API keys only accessible from Rust backend code, never exposed to frontend.
- **Diff validation**: All AI edits are validated (exact string match, max 120 lines) and test-compiled before acceptance.

### OpenSCAD Integration

- **Binary detection**: Auto-detects OpenSCAD in PATH or common install locations (`/Applications/OpenSCAD.app/...`, `C:\Program Files\OpenSCAD\...`)
- **Subprocess spawning**: Each render spawns a new OpenSCAD process (no persistent daemon yet)
- **Stderr parsing**: Diagnostics extracted via regex (brittle, may miss some edge cases)
- **Working directory**: Pass to OpenSCAD for resolving `use`/`include` directives

### Performance

- **Debounced rendering**: 300ms debounce on code changes (configurable)
- **Content-hash caching**: SHA-256 of source + params avoids redundant renders
- **Resolution scaling**: Not yet implemented (roadmap item)

## Testing Strategy

- **Manual testing**: Primary method during development (Phase 1-3)
- **Golden tests**: Planned for Rust render pipeline (Phase 4)
- **E2E tests**: Playwright tests planned (Phase 4)
- **Unit tests**: Planned for React components (Phase 4)

## Current Status

### Completed (Phase 1-3)
✅ Monaco editor with OpenSCAD syntax
✅ Live PNG/STL/SVG preview
✅ Error diagnostics with inline markers
✅ Auto-detect OpenSCAD installation
✅ 3D mesh viewer (Three.js)
✅ Export to STL, OBJ, AMF, 3MF, PNG, SVG, DXF
✅ Content-hash caching
✅ 2D mode with SVG viewer
✅ Native Rust AI copilot with direct API integration
✅ Diff-based code editing with validation
✅ Tool call visualization
✅ Conversation history and management

### Planned (Phase 4+)
- Customizer panel for OpenSCAD parameters
- Special operators preview (`#`, `%`, `*`, `!`)
- Configurable preview resolution
- Advanced 3D viewer features (measurement, section planes)
- Cross-platform testing (Windows/Linux)
- Code signing for macOS/Windows
- Auto-update mechanism
- CI/CD and automated testing

## Known Issues & Gotchas

1. **Image caching**: Browser caches preview images. Use cache-busting query params (`?t=${timestamp}`)
2. **OpenSCAD `--imgsize` format**: Must be `W,H` (comma), not `WxH` (x)
3. **Monaco line numbers**: Line numbers in diagnostics are 1-indexed, Monaco uses 0-indexed
4. **Cross-platform**: Only tested on macOS; Windows/Linux testing pending

## Code Style

### Rust
- Follow `rustfmt` defaults
- Use `Result<T, E>` for error handling
- Prefer `async` functions for I/O operations
- Document public APIs with doc comments

### TypeScript/React
- Use functional components with hooks (no class components)
- Prefer `const` over `let`
- Use TypeScript strict mode
- Async/await over promises
- Custom hooks for shared logic

### Commit Convention
- ✨ `feat:` New feature
- 🐛 `fix:` Bug fix
- 📝 `docs:` Documentation
- ♻️ `refactor:` Code restructuring
- ✅ `test:` Test additions

## Resources

- **OpenSCAD Docs**: https://openscad.org/documentation.html
- **Tauri Docs**: https://tauri.app/
- **Anthropic API**: https://docs.anthropic.com/
- **OpenAI API**: https://platform.openai.com/docs/
- **Monaco Editor**: https://microsoft.github.io/monaco-editor/
- **Three.js**: https://threejs.org/

## Getting Help

- Check `ROADMAP.md` for planned features and current phase
- Review `README.md` for high-level overview
- Examine test fixtures in `apps/ui/src-tauri/tests/` (when added)
- Consult inline code comments for complex logic

---

**Last Updated**: 2025-10-18
**Current Phase**: Phase 3 Complete, Phase 4 (Production Polish) Planning
