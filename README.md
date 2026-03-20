<p align="center">
  <img src="images/icon.png" alt="OpenSCAD Studio" width="128" height="128">
</p>

<h1 align="center">OpenSCAD Studio</h1>

<p align="center">
  <strong>A precision-first OpenSCAD workspace for makers, with live preview and an optional AI copilot</strong>
</p>

<p align="center">
  <a href="https://openscad-studio.pages.dev"><img src="https://img.shields.io/badge/Web-Try_Now-brightgreen.svg" alt="Try Now"></a>
  <img src="https://img.shields.io/badge/version-0.7.1-blue.svg" alt="Version">
  <img src="https://img.shields.io/badge/license-GPL--2.0-blue.svg" alt="License">
  <img src="https://img.shields.io/badge/Tauri-2.0-24C8DB.svg" alt="Tauri">
  <img src="https://img.shields.io/badge/React-19-61DAFB.svg" alt="React">
</p>

> **Try it now** - OpenSCAD Studio is available as a [web app](https://openscad-studio.pages.dev) with no install required, or as a [macOS desktop app](#desktop-macos). The web version runs entirely in your browser using WebAssembly.
>
> **Desktop:** macOS 10.15 (Catalina) or later.

---

<p align="center">
  <img src="images/example.png" alt="OpenSCAD Studio Screenshot" width="100%">
</p>

## Why OpenSCAD Studio

OpenSCAD Studio is built for hobbyist makers doing real fabrication work: 3D printing, laser cutting, prototyping, enclosures, fixtures, jigs, and personal projects that still demand exact dimensions and fast iteration.

The goal is not to turn OpenSCAD into a toy or an AI demo. The goal is to make the workflow faster, clearer, and more capable while preserving the technical trust and precision that make OpenSCAD valuable in the first place.

That means:

- Fast feedback loops for exact modeling work
- A dense, deliberate, tool-like interface instead of generic AI-product styling
- Shared web and desktop experiences with the same core workflow
- AI as an assistant for drafting, fixing, and explaining code, not the center of the product

## Features

- Browser-based app at [openscad-studio.pages.dev](https://openscad-studio.pages.dev) with no install required
- macOS desktop app built with Tauri
- Monaco-based OpenSCAD editor with syntax highlighting, multi-tab editing, format on save, and Vim mode
- Fast local rendering with `openscad-wasm` for the web app
- Interactive 3D mesh preview with orbit controls and content-hash caching
- Dedicated 2D SVG mode for laser-cutting and engraving workflows
- Real-time diagnostics with line- and column-accurate markers
- Customizer panel for interactive OpenSCAD parameters
- Library path support for `include` / `use` workflows, including libraries such as BOSL2
- Theme system with 22+ built-in themes
- Optional AI copilot for generating, editing, and explaining OpenSCAD code with your own Anthropic or OpenAI API key

**Limitations:** Special operators (!, #, %, \*) preview not yet implemented

## Product Direction

OpenSCAD Studio is moving toward a more polished, maker-first workflow:

- Faster iteration for precise modeling and fabrication tasks
- Better diagnostics and preview feedback you can trust
- Stronger support for multi-file and library-based OpenSCAD projects
- An AI copilot that becomes useful by understanding your code and preview context
- One shared React/TypeScript application across web and desktop

The product direction is deliberately professional and technically grounded: build, speed, precision.

## Installation

### Web (No Install)

Visit **[openscad-studio.pages.dev](https://openscad-studio.pages.dev)**. Works in Chrome and Edge (requires SharedArrayBuffer support). No OpenSCAD installation needed; rendering is done with WebAssembly in your browser.

### Desktop (macOS)

Install via Homebrew:

```bash
brew tap zacharyfmarion/openscad-studio
brew install --cask openscad-studio
```

Or download the latest DMG from [GitHub Releases](https://github.com/zacharyfmarion/openscad-studio/releases). Requires macOS 10.15 (Catalina) or later.

### Development

```bash
# Install dependencies
pnpm install

# Run web version in development mode
pnpm web:dev

# Run desktop version in development mode (requires Rust toolchain)
pnpm tauri:dev

# Build for production
pnpm web:build    # Web
pnpm tauri:build  # Desktop
```

Desktop development requires the [Rust toolchain](https://rustup.rs/). Web development only needs Node.js 18+ and pnpm.

## Architecture

OpenSCAD Studio uses one shared frontend for both the web app and the macOS desktop app:

- React + TypeScript for the UI
- `openscad-wasm` for local rendering in the browser
- Tauri for desktop shell features like native file dialogs and filesystem access
- Client-side AI requests via the Vercel AI SDK

The desktop app is not an AI backend. Tauri provides native shell capabilities, while AI chat, tool execution, and most product logic live in the shared frontend.

## Project Structure

```text
openscad-studio/
├── apps/
│   ├── ui/                      # Shared React frontend + Tauri desktop shell
│   │   ├── src/
│   │   │   ├── components/      # React components
│   │   │   ├── hooks/           # Custom React hooks
│   │   │   ├── platform/        # Platform abstraction layer
│   │   │   │   ├── types.ts     # PlatformBridge interface
│   │   │   │   ├── tauriBridge.ts # Desktop implementation
│   │   │   │   └── webBridge.ts # Web implementation
│   │   │   ├── services/        # Rendering, diagnostics, AI services
│   │   │   ├── stores/          # Zustand state management
│   │   │   └── themes/          # Built-in editor themes
│   │   └── src-tauri/           # Rust desktop runtime
│   └── web/                     # Web app entry point (Vite)
└── packages/
    └── shared/                  # Shared TypeScript types
```

## AI Copilot Setup

The AI copilot uses the [Vercel AI SDK](https://sdk.vercel.ai/) with streaming support. Requests are made client-side in both the web app and the Tauri desktop app.

API keys are currently stored in local storage state inside the browser or desktop webview. That is a convenience tradeoff for a shared web + desktop AI stack, not backend-style secret isolation.

1. Open Settings (⌘,)
2. Navigate to the AI tab
3. Enter your Anthropic or OpenAI API key

Supported providers:

- Anthropic
- OpenAI

The AI can:

- Read your current code and preview context
- Make targeted code changes
- Check diagnostics before applying edits
- Generate new OpenSCAD designs from natural language

## Documentation

- **[CLAUDE.md](CLAUDE.md)** - Comprehensive guide for AI assistants and contributors
- **[AGENTS.md](AGENTS.md)** - Current AI architecture, product context, and design guidance
- **[engineering-roadmap.md](engineering-roadmap.md)** - Detailed development roadmap with phases

## Roadmap Snapshot

- Completed: Monaco editor, live preview, 3D viewer, export, diagnostics, themes, AI copilot, web support with `openscad-wasm`, and library management
- In progress: architecture cleanup, deeper AI UX, and better multi-file project context
- Direction: keep improving precision workflows, technical trust, and the shared web/desktop experience without drifting into generic AI-product conventions

See [engineering-roadmap.md](engineering-roadmap.md) for the detailed breakdown.

## Contributing

Contributions are welcome. Please:

1. Check existing issues or create a new one to discuss your idea
2. Fork the repository and create a feature branch
3. Follow the code style (`prettier` for TypeScript, `rustfmt` for Rust)
4. Update documentation as needed
5. Submit a pull request

For detailed development guidelines, see [CLAUDE.md](CLAUDE.md) and [CONTRIBUTING.md](CONTRIBUTING.md).

## License

This project is licensed under the GNU General Public License v2.0. See [LICENSE](LICENSE) for details.

This license change was made to comply with OpenSCAD's GPL-2.0 license, as the project now bundles `openscad-wasm`.

## Acknowledgments

Built with:

- [Tauri](https://tauri.app/) - Rust-powered desktop framework
- [React](https://react.dev/) - UI framework
- [Monaco Editor](https://microsoft.github.io/monaco-editor/) - Code editor
- [Three.js](https://threejs.org/) - 3D rendering
- [OpenSCAD](https://openscad.org/) - The CSG tool this editor is built for
- [openscad-wasm](https://github.com/nicolo-ribaudo/openscad-wasm) - WebAssembly build of OpenSCAD
- [Vercel AI SDK](https://sdk.vercel.ai/) - AI streaming framework

---

Built for the OpenSCAD community.
