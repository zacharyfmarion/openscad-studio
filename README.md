<p align="center">
  <img src="images/icon.png" alt="OpenSCAD Studio" width="128" height="128">
</p>

<h1 align="center">OpenSCAD Studio</h1>

<p align="center">
  <strong>A modern cross-platform OpenSCAD editor with live preview and AI copilot</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-0.4.0-blue.svg" alt="Version">
  <img src="https://img.shields.io/badge/license-MIT-green.svg" alt="License">
  <img src="https://img.shields.io/badge/Tauri-2.0-24C8DB.svg" alt="Tauri">
  <img src="https://img.shields.io/badge/React-19-61DAFB.svg" alt="React">
  <img src="https://img.shields.io/badge/Rust-1.82+-000000.svg" alt="Rust">
</p>

> **⚠️ Early Alpha Software**
> This project is in early alpha and has only been tested on macOS. Windows and Linux support is planned but not yet implemented or tested.

---

<p align="center">
  <img src="images/example.png" alt="OpenSCAD Studio Screenshot" width="100%">
</p>

## ✨ Motivation

As a software engineer and maker hobbyist, I love OpenSCAD. It allows for precision and maps to my mental model of building things. However, some operations (like rounding with `minkowski`) are not very intuitive. At work, I often use Cursor and Claude Code for writing code, and found myself plugging my OpenSCAD code into ChatGPT in order to either (1) scaffold out a starting point or (2) fix a confusing issue in my code. I also became frustrated by certain limitations of the OpenSCAD editor, like not being able to easily indent code with the editor commands I'm used to. So I built OpenSCAD Studio, which aims to be something like a Cursor for the language.

## Features

- 🤖 **AI copilot** - Chat with Claude/GPT to generate and fix code (bring your own API key)
- 🎨 **Modern editor** - OpenSCAD syntax highlighting, multi-tab editing, format on save, vim mode support
- 📐 **2D mode** - Dedicated SVG viewer for laser cutting and engraving
- 🖼️ **Live 3D preview** - Interactive mesh viewer with orbit controls and content-hash caching
- 🔍 **Real-time diagnostics** - Inline error markers with line/column precision
- ⚙️ **Customizer panel** - Interactive controls for OpenSCAD parameters with auto-rendering
- 🌈 **22+ themes** - Popular themes like Catppuccin, Dracula, One Dark Pro, GitHub, Nord, Tokyo Night, and more

**Limitations:** Special operators (!, #, %, *) preview not yet implemented

## 📦 Installation

### Prerequisites

1. The **opescad** cli binary must be installed and available in your PATH. You can install via package manager:
  - macOS: `brew install openscad`
  - Ubuntu: `sudo apt install openscad`
  - Windows: Download installer from website

2. For development, you'll need:
   - **Node.js** 18+ and **pnpm**
     ```bash
     npm install -g pnpm
     ```
   - **Rust** toolchain (for building Tauri backend)
     ```bash
     curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
     ```

### Development

```bash
# Install dependencies
pnpm install

# Run in development mode (with hot reload)
pnpm tauri:dev

# Build for production
pnpm tauri:build
```

The built application will be in `apps/ui/src-tauri/target/release/bundle/`.

## 🏗️ Project Structure

```
openscad-studio/
├── apps/
│   ├── ui/                      # React + Vite frontend
│   │   ├── src/
│   │   │   ├── api/             # Tauri IPC wrappers
│   │   │   ├── components/      # React components
│   │   │   ├── hooks/           # Custom React hooks (useOpenScad, useAiAgent)
│   │   │   ├── stores/          # State management
│   │   │   └── themes/          # Theme definitions
│   │   └── src-tauri/           # Rust backend
│   │       ├── src/
│   │       │   ├── cmd/         # Tauri commands (render, AI tools)
│   │       │   ├── ai_agent.rs  # Native Rust AI agent
│   │       │   └── utils/       # OpenSCAD parser, caching
│   │       └── Cargo.toml
└── packages/
    └── shared/                  # Shared TypeScript types (Zod schemas)
```

## 🤖 AI Copilot Setup

The AI copilot uses a native Rust implementation with direct API integration and secure encrypted storage.

1. Open Settings (⌘,)
2. Navigate to "AI" tab
3. Enter your Anthropic / OpenAI API key
4. Key is securely stored using Tauri's encrypted store plugin

**Supported Providers:**
- Anthropic (Claude Sonnet 4.5, Claude Sonnet 3.5)
- OpenAI (GPT-4)

The AI can:
- View your current code and preview
- Make targeted code changes with exact string replacement
- Check for compilation errors
- All edits are validated and test-compiled before acceptance

## 📚 Documentation

- **[CLAUDE.md](CLAUDE.md)** - Comprehensive guide for AI assistants and contributors
- **[AGENTS.md](AGENTS.md)** - AI agent architecture and tool definitions
- **[ROADMAP.md](ROADMAP.md)** - Detailed development roadmap with phases

## 🗺️ Roadmap

- ✅ **Phase 1-2 (Completed)**: Monaco editor, live preview, 3D viewer, export, caching
- ✅ **Phase 3 (Completed)**: AI copilot with native Rust implementation
- 🔜 **Phase 4 (Planned)**: Multi-file projects, testing, distribution

See [ROADMAP.md](ROADMAP.md) for detailed breakdown.

## 🤝 Contributing

Contributions are welcome! Please:

1. Check existing issues or create a new one to discuss your idea
2. Fork the repository and create a feature branch
3. Follow the code style (rustfmt for Rust, prettier for TypeScript)
4. Update documentation as needed
5. Submit a pull request

For detailed development guidelines, see [CLAUDE.md](CLAUDE.md).

## 📄 License

MIT License - see [LICENSE](LICENSE) for details.

## 🙏 Acknowledgments

Built with:
- [Tauri](https://tauri.app/) - Rust-powered desktop framework
- [React](https://react.dev/) - UI framework
- [Monaco Editor](https://microsoft.github.io/monaco-editor/) - Code editor
- [Three.js](https://threejs.org/) - 3D rendering
- [OpenSCAD](https://openscad.org/) - The amazing CSG tool this editor is built for

---

**Made with ❤️ for the OpenSCAD community**
