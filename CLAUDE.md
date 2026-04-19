# Claude.md - AI Assistant Guide for OpenSCAD Studio

This document helps AI assistants (like Claude) understand the OpenSCAD Studio codebase and work effectively on it.

## Project Overview

**OpenSCAD Studio** is a modern OpenSCAD editor with live preview and AI copilot capabilities. It runs both as a **web app** (at [openscad-studio.pages.dev](https://openscad-studio.pages.dev)) and as a **macOS desktop app** (via Tauri). Both platforms share the same React codebase; the web app uses openscad-wasm for rendering while the desktop app uses a bundled native OpenSCAD binary for faster rendering and full filesystem access.

The top-level `README.md` is user-facing. Keep it focused on product overview, installation, and contribution entry points. Engineering details, architecture notes, analytics contracts, and roadmap material belong in files like `CLAUDE.md`, `AGENTS.md`, `DEVELOPMENT.md`, `engineering-roadmap.md`, and `docs/`.

**Tech Stack:**

- **Frontend**: React 18 + TypeScript + Vite + Monaco Editor
- **Desktop Runtime**: Rust + Tauri for native shell features, packaging, and filesystem access
- **Rendering**: Web uses openscad-wasm via Web Worker; desktop uses a bundled native OpenSCAD binary via Tauri IPC
- **AI Agent**: TypeScript with Vercel AI SDK (`streamText`)
- **External Agent Bridge (desktop)**: Tauri-hosted localhost MCP server bound to workspace windows
- **Web Deployment**: Cloudflare Pages
- **Package Manager**: pnpm (monorepo workspace)

## Design Context

### Users

OpenSCAD Studio should optimize first for hobbyist makers. These users are building precise 2D and 3D models for fabrication, prototyping, printing, laser cutting, and personal projects. They value tools that help them move quickly without feeling simplified or toy-like, and they want an environment that supports experimentation while still feeling trustworthy for exact work.

### Brand Personality

The brand personality is build, speed, precision. The product should feel professional, technically credible, and efficient. It should support focused making work with confidence and clarity rather than leaning on playful novelty or overt AI-first theatrics.

### Aesthetic Direction

Preserve and tighten the current aesthetic instead of replacing it. The existing theme system is a strength and should remain intact, with Solarized Dark continuing as the default baseline unless intentionally changed elsewhere. The visual direction should take cues from tools like Ableton Live and Affinity Designer: dense but deliberate, polished, capable, and tuned for serious creative work. Avoid anything that feels generic, glossy, or obviously AI-generated.

### Design Principles

1. Respect maker workflows. Prioritize fast iteration, precise feedback, and layouts that help users stay in flow while modeling.
2. Tighten, do not reinvent. Improve hierarchy, spacing, contrast, and polish within the current design language instead of introducing a disconnected visual reset.
3. Feel professionally technical. Interfaces should communicate capability and precision without becoming cold, cluttered, or intimidating.
4. Preserve theme flexibility. New UI work must fit naturally into the existing theme system and work well in both dark and light themes.
5. Avoid AI-generic styling. Favor intentional, grounded, tool-like design over flashy gradients, empty decoration, or trendy "generated" aesthetics.

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
│   │   │   │   ├── nativeRenderService.ts # Native OpenSCAD binary IPC (desktop)
│   │   │   │   └── openscad-worker.ts # OpenSCAD WASM Web Worker
│   │   │   ├── stores/             # Zustand stores
│   │   │   │   └── projectStore.ts # Multi-file project state
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
┌──────────────────────────┬──────────────────────────┐
│  Desktop (Tauri)          │  Web (Browser)            │
│  Tauri shell               │  Browser runtime          │
│  Native file I/O           │  File System API          │
│         ↓                  │         ↓                 │
│  Native OpenSCAD binary    │  OpenSCAD WASM            │
│  via Tauri IPC (render.rs) │  via Web Worker           │
└──────────────────────────┴──────────────────────────┘
    ↓
Vercel AI SDK → Anthropic/OpenAI API (HTTPS)

Desktop-only external agent path:
Local MCP client → Tauri MCP server (`mcp.rs`) → active workspace window bridge
```

### Key Design Patterns

1. **Dual Rendering**: Web uses openscad-wasm in a Web Worker; desktop uses a bundled native OpenSCAD binary invoked via Tauri IPC (`render.rs`), which provides faster rendering and full filesystem access for `include`/`use` resolution.

2. **Multi-file Projects**: Projects can contain multiple `.scad` files with a designated render target. The desktop app manages project directories and resolves `include`/`use` paths against the project root.

3. **Multi-format Preview**:
   - Interactive STL/3D mesh for manipulation
   - SVG for 2D designs

4. **Shared Client-Side AI**: Both web and desktop use the same frontend AI stack for the in-app copilot. Requests are made directly from the React app with Vercel AI SDK's `streamText`, and API keys are currently stored in obfuscated localStorage-backed state inside the browser/webview.

5. **Diff-based AI Editing**: AI returns exact string replacements, not full file rewrites.

6. **Content-hash Caching**: SHA-256 of source + params → cached artifact path. Avoids redundant renders.

7. **Platform Bridge**: Components use a `PlatformBridge` interface (`apps/ui/src/platform/types.ts`) and never import Tauri or web-specific APIs directly.
8. **Desktop MCP Bridge**: Desktop builds can expose a loopback-only MCP server from Tauri that binds external-agent sessions to a specific Studio window and routes render/diagnostic/screenshot/export requests through the frontend bridge.

## Important Files

### Frontend (React)

- **`apps/ui/src/App.tsx`**: Main application component. Handles tab management, menu events, keyboard shortcuts, file I/O, and layout.
- **`apps/ui/src/hooks/useOpenScad.ts`**: Core rendering logic. Orchestrates both WASM (web) and native binary (desktop) rendering, debouncing, and diagnostics parsing.
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
- **`apps/ui/src/services/desktopMcp.ts`**: Desktop MCP bridge. Connects the Tauri localhost MCP server to the active workspace window and implements external-agent render, screenshot, diagnostics, and export handlers.
- **`apps/ui/src/services/renderService.ts`**: Render orchestration — manages Web Worker communication, caching, diagnostics.
- **`apps/ui/src/services/openscad-worker.ts`**: Web Worker that loads openscad-wasm and handles render requests off the main thread.
- **`apps/ui/src/services/nativeRenderService.ts`**: Native OpenSCAD binary IPC bridge (desktop only). Communicates with the Tauri backend to invoke the bundled binary.
- **`apps/ui/src/stores/projectStore.ts`**: Multi-file project state (files, render target, project root).

### Web App

- **`apps/web/src/main.tsx`**: Web-specific bootstrap — wraps app in ErrorBoundary, checks browser compatibility.
- **`apps/web/index.html`**: Loading screen, browser compat check, PWA metadata.
- **`apps/web/public/_headers`**: COOP/COEP headers for SharedArrayBuffer support.

### Backend (Rust — Desktop Only)

- **`apps/ui/src-tauri/src/lib.rs`**: Tauri app initialization, command registration.
- **`apps/ui/src-tauri/src/cmd/render.rs`**: Native render workspace management, binary invocation, and output collection.
- **`apps/ui/src-tauri/src/mcp.rs`**: Desktop localhost MCP server, session/window binding, and request routing for external agents.

## Development Workflow

### Prerequisites

1. **pnpm**: `npm install -g pnpm`
2. **Rust** toolchain (desktop only): `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`
3. **OpenSCAD binary** (desktop only): `bash apps/ui/src-tauri/scripts/download-openscad.sh`

### Running the App

```bash
# Install dependencies
pnpm install

# Web development (no Rust needed)
pnpm web:dev

# Desktop development (requires Rust + OpenSCAD binary)
bash apps/ui/src-tauri/scripts/download-openscad.sh   # one-time setup
pnpm tauri:dev

# Build for production
pnpm web:build      # Web
pnpm tauri:build    # Desktop (downloads OpenSCAD binary automatically in CI)
```

### OpenSCAD Binary (Desktop)

The desktop app bundles a native OpenSCAD binary for rendering instead of WASM. This gives full filesystem access (so `import()` resolves files from disk), system fonts, and faster rendering.

- **Binary source**: OpenSCAD snapshot builds from `files.openscad.org/snapshots/`
- **Current version**: `2026.03.16` (pinned in `apps/ui/src-tauri/scripts/download-openscad.sh`)
- **Bundle size**: ~148MB (binary + Qt6 frameworks + dylibs)
- **Location**: `apps/ui/src-tauri/binaries/OpenSCAD.app` (gitignored, downloaded at build time)

**Local development**:
```bash
# Download the binary (only needed once, re-run to update)
cd apps/ui/src-tauri
bash scripts/download-openscad.sh

# To force re-download:
rm -rf binaries/OpenSCAD.app && bash scripts/download-openscad.sh
```

The script handles quarantine stripping and ad-hoc signing for local development. In CI, Tauri's build process signs the bundled `.app` with the Apple Developer certificate and the DMG is notarized.

**Web**: continues using openscad-wasm (no binary needed).

### Project Scripts

```bash
pnpm web:dev            # Run web version dev server
pnpm web:build          # Build web version
pnpm tauri:dev          # Run Tauri desktop app in dev mode
pnpm tauri:build        # Build production desktop app
pnpm lint               # Lint all workspaces
pnpm type-check         # Type check all workspaces
pnpm format             # Format all code
pnpm test:e2e:web       # Run web Playwright coverage
pnpm test:scripts       # Run repo workflow helper tests
pnpm validate:changes   # Run the shared validation helper
```

### `/create` Workflow

- The repo-local `create-feature` skill under `.agents/skills/create-feature/` is the entry point for requests like `/create <prompt>` or "take this from plan to PR".
- The skill should inspect checkout readiness, create and maintain an implementation plan for non-trivial work, implement the change, add the right tests, run deterministic validation through `scripts/validate-changes.sh`, open a draft PR against `main`, and return the preview URL when one exists.
- The skill must not create worktrees. If it is already inside a worktree, it should make sure that checkout is ready and then proceed there.
- PR previews are published through the `Deploy PR Preview` GitHub Actions workflow to `https://pr-<number>.openscad-studio.pages.dev` for web-relevant pull requests.

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

**Current Themes (27 total):**

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
- **API keys**: Stored client-side in obfuscated localStorage-backed state today, including in the Tauri webview. This is a convenience tradeoff, not hardened secret isolation.
- **File I/O**: Desktop uses native file dialogs via Tauri. Web uses File System Access API with fallbacks.

### WASM Rendering (Web)

- **Web Worker**: The web app uses openscad-wasm via a Web Worker (`apps/ui/src/services/openscad-worker.ts`). Rendering is async and off the main thread.
- **Diagnostics**: OpenSCAD stderr is parsed in TypeScript to extract error/warning diagnostics.
- **SharedArrayBuffer**: The web version requires COOP/COEP headers for SharedArrayBuffer support (configured in `apps/web/public/_headers`).

### Native Rendering (Desktop)

- **Bundled binary**: The desktop app invokes a bundled native OpenSCAD binary (`apps/ui/src-tauri/binaries/OpenSCAD.app`) via Tauri IPC commands defined in `render.rs`.
- **Workspace management**: Source files are written to a temporary render workspace so the native binary can resolve `include`/`use` paths and multi-file projects.
- **Diagnostics**: Stderr from the native binary is captured and parsed using the same TypeScript diagnostics pipeline as the WASM path.

### Desktop MCP (External Agents)

- **Loopback-only server**: Desktop builds can run a localhost MCP endpoint, configured in Settings → External Agents.
- **Window binding**: Each MCP session binds to a specific Studio workspace window so external-agent actions stay scoped.
- **Tool routing**: MCP requests are mediated by Tauri and fulfilled in the frontend bridge (`desktopMcp.ts`), not by a separate backend AI loop.

### Performance

- **Debounced rendering**: 300ms debounce on code changes (configurable)
- **Content-hash caching**: SHA-256 of source + params avoids redundant renders

## Testing Strategy

- **Unit and component tests**: Jest + React Testing Library under `apps/ui/src/**/__tests__`
- **Formatter regression tests**: Dedicated Jest config and fixture-driven expectations in `apps/ui/src/utils/formatter/__tests__`
- **E2E tests**: Playwright coverage in CI for web and Tauri desktop flows
- **Manual testing**: Still important for rendering, AI flows, and platform-specific behavior

## Current Status

### Current Capabilities (v1.2.1)

✅ Monaco editor with OpenSCAD syntax highlighting
✅ Live STL/SVG preview (web: openscad-wasm, desktop: native binary)
✅ Error diagnostics with inline markers
✅ 3D mesh viewer (Three.js) with wireframe/orthographic/shadows
✅ Export to STL, OBJ, AMF, 3MF, PNG, SVG, DXF
✅ Content-hash caching
✅ 2D mode with SVG viewer
✅ AI copilot with Vercel AI SDK (streaming, tool calls)
✅ Diff-based code editing
✅ Tool call visualization
✅ Multi-turn AI chat with draft and attachment state
✅ Customizer panel with interactive parameter controls
✅ Tree-sitter based parameter parsing
✅ 27 editor themes with categorized dropdown
✅ Vim mode with configurable keybindings
✅ Web version (openscad-studio.pages.dev)
✅ Platform abstraction (PlatformBridge interface)
✅ Toast notifications, markdown in AI chat
✅ Error boundary, loading screen, browser compatibility check
✅ CI/CD pipeline (GitHub Actions)
✅ Homebrew distribution for macOS
✅ Cloudflare Pages deployment for web
✅ Share links with Cloudflare Pages Functions, KV, and R2-backed thumbnails
✅ PostHog analytics controls and Sentry error reporting
✅ 2D and 3D measurement tools plus 3D section planes
✅ Multi-file project support with file tree, tabs, and include/use resolution
✅ Auto-created project directories on desktop
✅ Native OpenSCAD binary bundling for desktop (faster rendering, full filesystem access)
✅ Desktop External Agents settings with localhost MCP access

### Planned

- Special operators preview (`#`, `%`, `*`, `!`)
- Additional preview/render polish
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
- Review tests under `apps/ui/src/**/__tests__` and formatter fixtures under `apps/ui/src/utils/formatter/__tests__`
- Consult inline code comments for complex logic

---

**Last Updated**: 2026-04-19
**Current Version**: v1.2.1 — Web + Desktop
