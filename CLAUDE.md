# Claude.md - AI Assistant Guide for OpenSCAD Studio

This document helps AI assistants (like Claude) understand the OpenSCAD Studio codebase and work effectively on it.

## Project Overview

**OpenSCAD Studio** is a modern OpenSCAD editor with live preview and AI copilot capabilities. It runs both as a **web app** (at [openscad-studio.pages.dev](https://openscad-studio.pages.dev)) and as a **macOS desktop app** (via Tauri). Both platforms share the same React codebase and use openscad-wasm for rendering.

**Tech Stack:**

- **Frontend**: React 19 + TypeScript + Vite + Monaco Editor
- **Desktop Backend**: Rust + Tauri (IPC-based architecture)
- **Rendering**: openscad-wasm via Web Worker (both platforms)
- **AI Agent**: TypeScript with Vercel AI SDK (`streamText`)
- **Web Deployment**: Cloudflare Pages
- **Package Manager**: pnpm (monorepo workspace)

## Architecture

### High-Level Structure

```
openscad-studio/
├── apps/
│   ├── ui/                         # Desktop app (Tauri + React)
│   │   ├── src/                    # Shared React frontend
│   │   │   ├── components/         # React components
│   │   │   │   ├── Editor.tsx      # Monaco code editor
│   │   │   │   ├── Preview.tsx     # Preview pane (STL/SVG)
│   │   │   │   ├── ThreeViewer.tsx # 3D mesh viewer
│   │   │   │   ├── AiPromptPanel.tsx # AI chat interface
│   │   │   │   ├── ErrorBoundary.tsx # Crash recovery UI
│   │   │   │   └── ...
│   │   │   ├── hooks/              # Custom React hooks
│   │   │   │   ├── useOpenScad.ts  # Rendering state management
│   │   │   │   └── useAiAgent.ts   # AI agent communication
│   │   │   ├── platform/           # Platform abstraction
│   │   │   │   ├── types.ts        # PlatformBridge interface
│   │   │   │   ├── tauriBridge.ts  # Desktop shell/file bridge
│   │   │   │   └── webBridge.ts    # Web (localStorage, fetch)
│   │   │   ├── services/           # Core services
│   │   │   │   ├── aiService.ts    # AI agent (Vercel AI SDK)
│   │   │   │   ├── renderService.ts # Render orchestration
│   │   │   │   └── openscad-worker.ts # OpenSCAD WASM Web Worker
│   │   │   ├── stores/             # Zustand stores
│   │   │   ├── themes/             # Theme definitions
│   │   │   └── utils/              # Utility functions
│   │   └── src-tauri/              # Rust backend (desktop only)
│   │       ├── src/
│   │       │   ├── cmd/            # Tauri commands (file I/O, window mgmt)
│   │       │   └── lib.rs          # App initialization
│   │       └── Cargo.toml
│   └── web/                        # Web app entry point
│       ├── src/main.tsx            # Web-specific bootstrap
│       ├── index.html              # Loading screen, browser compat check
│       └── public/                 # Favicons, manifest, COOP/COEP headers
└── packages/
    └── shared/                     # Shared TypeScript types (Zod schemas)
```

### Communication Flow

```
User Input
    ↓
React Frontend (TypeScript)
    ↓ (Platform Bridge)
┌─────────────────┬──────────────────┐
│  Desktop (Tauri) │  Web (Browser)   │
│  Tauri shell      │  Browser runtime │
│  Native file I/O  │  File System API │
└─────────────────┴──────────────────┘
    ↓
OpenSCAD WASM (Web Worker) — shared by both platforms
    ↓
Vercel AI SDK → Anthropic/OpenAI API (HTTPS)
```

### Key Design Patterns

1. **WASM Rendering**: OpenSCAD runs via openscad-wasm in a Web Worker on both platforms. No CLI binary needed.

2. **Multi-format Preview**:
   - Interactive STL/3D mesh for manipulation
   - SVG for 2D designs

3. **Shared Client-Side AI**: Both web and desktop use the same frontend AI stack. Requests are made directly from the React app with Vercel AI SDK's `streamText`, and API keys are currently stored in local storage state inside the browser/webview.

4. **Diff-based AI Editing**: AI returns exact string replacements, not full file rewrites.

5. **Content-hash Caching**: SHA-256 of source + params → cached artifact path. Avoids redundant renders.

6. **Platform Bridge**: Components use a `PlatformBridge` interface (`apps/ui/src/platform/types.ts`) and never import Tauri or web-specific APIs directly.

## Important Files

### Frontend (React)

- **`apps/ui/src/App.tsx`**: Main application component. Handles tab management, menu events, keyboard shortcuts, file I/O, and layout.
- **`apps/ui/src/hooks/useOpenScad.ts`**: Core rendering logic. Manages WASM rendering, debouncing, diagnostics parsing.
- **`apps/ui/src/hooks/useAiAgent.ts`**: AI agent communication. Handles streaming responses, tool call visualization.
- **`apps/ui/src/components/Editor.tsx`**: Monaco editor wrapper with OpenSCAD syntax highlighting.
- **`apps/ui/src/components/Preview.tsx`**: Conditional preview renderer (STL/SVG) with customizer integration.
- **`apps/ui/src/components/CustomizerPanel.tsx`**: Interactive parameter controls panel with collapsible tabs.
- **`apps/ui/src/components/AiPromptPanel.tsx`**: AI chat transcript and shared composer host.
- **`apps/ui/src/components/AiComposer.tsx`**: Shared text + image composer used by the welcome screen and main AI panel.
- **`apps/ui/src/components/ErrorBoundary.tsx`**: React error boundary with dark-themed recovery UI.
- **`apps/ui/src/utils/customizer/parser.ts`**: Tree-sitter based OpenSCAD parameter parser.

### Platform Layer

- **`apps/ui/src/platform/types.ts`**: `PlatformBridge` interface — defines all platform-dependent operations.
- **`apps/ui/src/platform/tauriBridge.ts`**: Desktop implementation for native file dialogs, directory access, and menu events.
- **`apps/ui/src/platform/webBridge.ts`**: Web implementation using localStorage, File System Access API, fetch.

### Services

- **`apps/ui/src/services/aiService.ts`**: AI agent using Vercel AI SDK (`streamText`). Handles streaming, tool calls, multi-turn conversations.
- **`apps/ui/src/services/renderService.ts`**: Render orchestration — manages Web Worker communication, caching, diagnostics.
- **`apps/ui/src/services/openscad-worker.ts`**: Web Worker that loads openscad-wasm and handles render requests off the main thread.

### Web App

- **`apps/web/src/main.tsx`**: Web-specific bootstrap — wraps app in ErrorBoundary, checks browser compatibility.
- **`apps/web/index.html`**: Loading screen, browser compat check, PWA metadata.
- **`apps/web/public/_headers`**: COOP/COEP headers for SharedArrayBuffer support.

### Backend (Rust — Desktop Only)

- **`apps/ui/src-tauri/src/lib.rs`**: Tauri app initialization, command registration.

## Development Workflow

### Prerequisites

1. **pnpm**: `npm install -g pnpm`
2. **Rust** toolchain (desktop only): `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`

### Running the App

```bash
# Install dependencies
pnpm install

# Web development (no Rust needed)
pnpm web:dev

# Desktop development (requires Rust)
pnpm tauri:dev

# Build for production
pnpm web:build      # Web
pnpm tauri:build    # Desktop
```

### Project Scripts

```bash
pnpm web:dev            # Run web version dev server
pnpm web:build          # Build web version
pnpm tauri:dev          # Run Tauri desktop app in dev mode
pnpm tauri:build        # Build production desktop app
pnpm lint               # Lint all workspaces
pnpm type-check         # Type check all workspaces
pnpm format             # Format all code
```

## Common Tasks

### Adding a New Tauri Command (Desktop Only)

1. Define command in Rust: `apps/ui/src-tauri/src/cmd/your_module.rs`
2. Register in `apps/ui/src-tauri/src/lib.rs`: `.invoke_handler(...)`
3. Add to `PlatformBridge` interface in `apps/ui/src/platform/types.ts`
4. Implement in `tauriBridge.ts` (desktop) and `webBridge.ts` (web)

### Adding a New AI Tool

1. Define the tool in `apps/ui/src/services/aiService.ts`
2. Add tool execution handler in the same file
3. Update system prompt if needed

### Adding or Modifying Themes

**Current Themes (22 total):**

- Classic: Solarized Dark/Light
- Popular Dark: Monokai, Dracula, One Dark Pro, GitHub Dark, Tokyo Night, Ayu Dark, Material Palenight, Night Owl
- Popular Light: GitHub Light, Atom One Light
- Pastel & Cozy: Nord, Catppuccin Mocha, Rosé Pine
- Vibrant & Fun: Synthwave '84, Shades of Purple, Cobalt2, Horizon
- Nature Inspired: Everforest Dark
- Retro: Gruvbox Dark/Light

**To add a new theme:**

1. Add theme definition in `apps/ui/src/themes/index.ts` with full `ThemeColors` and Monaco syntax highlighting
2. Add to `themes` registry at bottom of file
3. Add theme ID to registration list in `apps/ui/src/components/Editor.tsx` (`handleEditorDidMount`)
4. Themes are automatically grouped by `category` field in Settings dropdown
5. Themes use CSS custom properties for UI consistency and are applied via `applyTheme()`

## Important Constraints

### Platform Abstraction

- **PlatformBridge**: Components should use the `PlatformBridge` interface (`apps/ui/src/platform/types.ts`), never import Tauri or web APIs directly.
- **API keys**: Stored client-side in local storage state today, including in the Tauri webview. This is a convenience tradeoff, not hardened secret isolation.
- **File I/O**: Desktop uses native file dialogs via Tauri. Web uses File System Access API with fallbacks.

### WASM Rendering

- **Web Worker**: Both platforms use openscad-wasm via a Web Worker (`apps/ui/src/services/openscad-worker.ts`). Rendering is async and off the main thread.
- **Diagnostics**: OpenSCAD stderr is parsed in TypeScript to extract error/warning diagnostics.
- **SharedArrayBuffer**: The web version requires COOP/COEP headers for SharedArrayBuffer support (configured in `apps/web/public/_headers`).

### Performance

- **Debounced rendering**: 300ms debounce on code changes (configurable)
- **Content-hash caching**: SHA-256 of source + params avoids redundant renders

## Testing Strategy

- **Manual testing**: Primary method during development (Phase 1-3)
- **Golden tests**: Planned for Rust render pipeline (Phase 4)
- **E2E tests**: Playwright tests planned (Phase 4)
- **Unit tests**: Planned for React components (Phase 4)

## Current Status

### Completed (v0.7.0)

✅ Monaco editor with OpenSCAD syntax highlighting
✅ Live STL/SVG preview via openscad-wasm
✅ Error diagnostics with inline markers
✅ 3D mesh viewer (Three.js) with wireframe/orthographic/shadows
✅ Export to STL, OBJ, AMF, 3MF, PNG, SVG, DXF
✅ Content-hash caching
✅ 2D mode with SVG viewer
✅ AI copilot with Vercel AI SDK (streaming, tool calls)
✅ Diff-based code editing
✅ Tool call visualization
✅ Conversation history and management
✅ Customizer panel with interactive parameter controls
✅ Tree-sitter based parameter parsing
✅ 22+ editor themes with categorized dropdown
✅ Vim mode with configurable keybindings
✅ Web version (openscad-studio.pages.dev)
✅ Platform abstraction (PlatformBridge interface)
✅ Toast notifications, markdown in AI chat
✅ Error boundary, loading screen, browser compatibility check
✅ CI/CD pipeline (GitHub Actions)
✅ Homebrew distribution for macOS
✅ Cloudflare Pages deployment for web

### Planned

- Special operators preview (`#`, `%`, `*`, `!`)
- Configurable preview resolution
- Advanced 3D viewer features (measurement, section planes)
- Cross-platform desktop testing (Windows/Linux)
- Code signing for macOS
- Auto-update mechanism

## Known Issues & Gotchas

1. **SharedArrayBuffer**: Web version requires COOP/COEP headers. Some browsers/environments may not support this.
2. **Monaco line numbers**: Line numbers in diagnostics are 1-indexed, Monaco uses 0-indexed.
3. **Cross-platform**: Desktop only tested on macOS; Windows/Linux testing pending.
4. **WASM bundle size**: openscad-wasm is ~13MB uncompressed (~3-4MB with compression). Loading screen shown during download.

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

- Check `engineering-roadmap.md` for planned features and current phase
- Review `README.md` for high-level overview
- Examine test fixtures in `apps/ui/src-tauri/tests/` (when added)
- Consult inline code comments for complex logic

---

**Last Updated**: 2026-02-19
**Current Version**: v0.7.0 — Web + Desktop
