# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.8.1] - 2026-03-06

- Hide libraries settings tab on web

## [0.8.0] - 2026-03-06

- Comprehensive e2e test coverage
- Fix for Customizer panel race condition
- Fix importing external libraries + new UI for linking libraries

## [0.7.1] - 2026-02-20

- Fix issue where includes were not being properly parsed on desktop following the wasm migration

## [0.7.0] - 2026-02-19

## 🌐 Now Available on the Web

OpenSCAD Studio now runs entirely in your browser — no install needed. Visit **[openscad-studio.pages.dev](https://openscad-studio.pages.dev)** to start designing immediately.

Rendering is powered by [openscad-wasm](https://github.com/nicolo-ribaudo/openscad-wasm), so everything runs client-side. Works in Chrome and Edge.

## ✨ What's New

- **AI copilot on web** — same streaming AI assistant, now works in the browser with your own API key
- **Dynamic model fetching** — latest Anthropic and OpenAI models appear automatically
- **Markdown rendering** in AI chat messages
- **Toast notifications** replace browser alert dialogs
- **Editable file names** in the tab bar
- **First-run layout picker** for new users
- **Download for Mac** link in the web app header with auto-detected architecture
- **Console panel** now separates ECHO output from diagnostics

## ⚖️ License Change

License changed from MIT to **GPL-2.0** to comply with the openscad-wasm dependency.

## Installation

### Web

Visit **[openscad-studio.pages.dev](https://openscad-studio.pages.dev)**

### macOS

Download the DMG for your architecture from the assets below.

## [0.7.0] - 2026-02-19

### Added

- **Web app**: OpenSCAD Studio now runs in the browser at [openscad-studio.pages.dev](https://openscad-studio.pages.dev)
- **openscad-wasm rendering**: Both web and desktop use WebAssembly-based OpenSCAD rendering via Web Worker — no CLI binary needed
- **Platform abstraction**: PlatformBridge interface with TauriBridge (desktop) and WebBridge (web) implementations
- **TypeScript AI agent**: Replaced native Rust AI agent with Vercel AI SDK (`streamText`) for streaming AI responses
- **Cloudflare Pages deployment**: Automated deployment via GitHub Actions
- **Loading screen**: Animated splash screen while WASM loads in browser
- **Browser compatibility check**: Detects SharedArrayBuffer/WebAssembly support, shows friendly error for unsupported browsers
- **Error boundary**: React error boundary prevents full-app crashes, shows recovery UI
- **PWA manifest**: Web app installable with proper icons and metadata
- **COOP/COEP headers**: Enable SharedArrayBuffer for openscad-wasm in all browsers
- Model selector in AI chat panel to switch between models mid-conversation
- Active tab indicator with accent color at bottom
- Welcome screen now replaces untitled tab instead of creating a new one
- Bottom toolbar badges showing configured status for API keys

### Changed

- AI agent rewritten from Rust (direct API calls) to TypeScript (Vercel AI SDK)
- Rendering engine changed from CLI OpenSCAD subprocess to openscad-wasm Web Worker
- Window title always shows "OpenSCAD Studio" instead of filename
- License changed from MIT to GPL-2.0 (due to openscad-wasm bundling)
- Model selection is now the single source of truth for API routing
- Provider is determined from selected model name
- Settings dialog now focuses solely on API key management

### Fixed

- Model selector now correctly routes to the appropriate API provider
- Tab close button works correctly with drag-to-reorder functionality
- Thinking indicator shows properly between tool call rounds

### Removed

- Native Rust AI agent (`ai_agent.rs`, `cmd/ai.rs`, `cmd/ai_tools.rs`, etc.)
- CLI OpenSCAD dependency for rendering
- `api/tauri.ts` (replaced by platform bridge)

## [0.6.0] - 2026-02-16

### Added

- Tab bar moved to app header for a cleaner, browser-like experience
- Redesigned Settings dialog with icons, card-based sections, and backdrop blur
- Dockview sash hover styling with accent color

### Changed

- Default workspace layout: Console and AI panels share a full-width bottom row
- Customizer tab starts inactive by default
- Cleaner status badges and buttons in Settings (no emoji)

## [0.5.1] - 2026-01-23

Update minimum version requirement to Catalina since that is the min version that Tuari 2.0 supports

## [0.5.0] - 2026-01-23

Release app through homebrew instead of via dmg to bypass issues with gatekeeper, automate release

## [0.2.0] - 2025-10-17

## [0.1.1] - 2025-10-15

- Add a screen if users do not have openscad available in their path

## [0.1.0] - 2025-10-15

## [Unreleased]
