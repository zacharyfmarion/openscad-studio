<p align="center">
  <img src="images/icon.png" alt="OpenSCAD Studio" width="128" height="128">
</p>

<h1 align="center">OpenSCAD Studio</h1>

<p align="center">
  <strong>A modern OpenSCAD editor with live preview and AI copilot for the web and macOS desktop</strong>
</p>

<p align="center">
  <a href="https://openscad-studio.pages.dev"><img src="https://img.shields.io/badge/Web-Try_Now-brightgreen.svg" alt="Try Now"></a>
  <img src="https://img.shields.io/github/v/release/zacharyfmarion/openscad-studio?display_name=tag" alt="Latest Release">
  <img src="https://img.shields.io/badge/license-GPL--2.0-blue.svg" alt="License">
  <img src="https://img.shields.io/badge/Tauri-2.0-24C8DB.svg" alt="Tauri">
  <img src="https://img.shields.io/badge/React-18-61DAFB.svg" alt="React">
</p>

> **🌐 Try it now** — OpenSCAD Studio is available as a [web app](https://openscad-studio.pages.dev) (no install needed) or as a [macOS desktop app](#desktop-macos). The web version runs entirely in your browser using WebAssembly. The desktop app bundles a native OpenSCAD binary for faster rendering and full filesystem access.
>
> **Desktop:** macOS 10.15 (Catalina) or later.

---

<p align="center">
  <img src="images/example.png" alt="OpenSCAD Studio Screenshot" width="100%">
</p>

## ✨ Motivation

As a software engineer and maker hobbyist, I love OpenSCAD. It allows for precision and maps to my mental model of building things. However, some operations (like rounding with `minkowski`) are not very intuitive. At work, I often use Cursor and Claude Code for writing code, and found myself plugging my OpenSCAD code into ChatGPT in order to either (1) scaffold out a starting point or (2) fix a confusing issue in my code. I also became frustrated by certain limitations of the OpenSCAD editor, like not being able to easily indent code with the editor commands I'm used to. So I built OpenSCAD Studio, which aims to be something like a Cursor for the language.

## Features

- 🌐 **Web app** - Use directly in your browser at [openscad-studio.pages.dev](https://openscad-studio.pages.dev) — no install needed
- 🤖 **AI copilot** - Chat with Claude/GPT to generate and fix code (bring your own API key)
- 🎨 **Modern editor** - OpenSCAD syntax highlighting, multi-tab editing, formatter support, and vim mode
- 📐 **2D mode** - Dedicated SVG viewer for laser cutting and engraving
- 🖼️ **Live 3D preview** - Interactive mesh viewer with orbit controls, section planes, measurements, and content-hash caching
- 🔍 **Real-time diagnostics** - Inline error markers with line/column precision
- ⚙️ **Customizer panel** - Interactive controls for OpenSCAD parameters with auto-rendering
- 🔗 **Share links** - Publish browser-based share links with thumbnail support for remixable examples
- 📁 **Multi-file projects** - File tree, multiple tabs, include/use resolution, and auto-created project directories (desktop)
- 🌈 **Theme library** - 22 built-in themes including Solarized, Dracula, GitHub, Nord, Tokyo Night, Catppuccin, and more

**Limitations:** Special operators (!, #, %, \*) preview not yet implemented

## 📦 Installation

### Web (No Install)

Visit **[openscad-studio.pages.dev](https://openscad-studio.pages.dev)**. Works in recent Chrome, Edge, and Firefox builds with SharedArrayBuffer support. No OpenSCAD installation needed — rendering is done via WebAssembly in your browser.

### Desktop (macOS)

Install via Homebrew:

```bash
brew tap zacharyfmarion/openscad-studio
brew install --cask openscad-studio
```

Or download the latest DMG from [GitHub Releases](https://github.com/zacharyfmarion/openscad-studio/releases). Requires macOS 10.15 (Catalina) or later.

### Development

Local setup, share-feature testing, project structure, AI setup, and contributor-facing references now live in [DEVELOPMENT.md](DEVELOPMENT.md).

## 🤝 Contributing

Contributions are welcome! Please:

1. Check existing issues or create a new one to discuss your idea
2. Fork the repository and create a feature branch
3. Follow the code style (prettier for TypeScript, rustfmt for Rust)
4. Update documentation as needed
5. Submit a pull request

For detailed development guidelines, see [CLAUDE.md](CLAUDE.md) and [CONTRIBUTING.md](CONTRIBUTING.md).

## 📄 License

This project is licensed under the GNU General Public License v2.0 - see [LICENSE](LICENSE) for details.

This license change was made to comply with OpenSCAD's GPL-2.0 license, as the project bundles openscad-wasm (web) and the native OpenSCAD binary (desktop).

## 🙏 Acknowledgments

Built with:

- [Tauri](https://tauri.app/) - Rust-powered desktop framework
- [React](https://react.dev/) - UI framework
- [Monaco Editor](https://microsoft.github.io/monaco-editor/) - Code editor
- [Three.js](https://threejs.org/) - 3D rendering
- [OpenSCAD](https://openscad.org/) - The amazing CSG tool this editor is built for
- [openscad-wasm](https://github.com/nicolo-ribaudo/openscad-wasm) - WebAssembly build of OpenSCAD
- [Vercel AI SDK](https://sdk.vercel.ai/) - AI streaming framework

---

**Made with ❤️ for the OpenSCAD community**
