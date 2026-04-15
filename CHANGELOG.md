# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.2.1] - 2026-04-15

### Added
- Expandable AI tool call details in the copilot panel for easier inspection of model actions.

### Fixed
- Empty desktop workspace folders now open reliably instead of getting stuck during workspace startup.
- Export actions now preserve project and library context so multi-file models export correctly.
- Collapsed AI screenshot thumbnails now restore correctly in the chat transcript.

## [1.2.0] - 2026-04-10

### Added
- Desktop MCP support for external agents to access project context, diagnostics, renders, and preview screenshots from OpenSCAD Studio.
- Desktop AI settings now include external agent setup guidance and MCP connection details.

### Changed
- Improved MCP onboarding and preview artifact flows for desktop agent workflows.
- Unified AI diagnostics with project render inputs to keep preview and validation feedback aligned.

### Fixed
- Fixed web startup and AI validation regressions.
- Fixed the Tauri dev rebuild loop in worktree sessions on macOS.

## [1.1.0] - 2026-04-08

### Added

- Support for `.h` header files in project file tree

### Fixed

- Fix macOS 26+ crash when rendering (SIGKILL on bundled OpenSCAD binary due to quarantine/provenance attributes)
- Fix dependency-aware render cache invalidation
- Fix 3D preview self-shadow artifacts
- Fix 2D viewer fill color

### Changed

- Soften 2D viewer fill color for better visual clarity

## [1.0.1] - 2026-04-02

### Added
- Multi-file project workflows with a file tree and workspace switching for larger OpenSCAD projects.
- Shareable design links with web loading, thumbnails, and better staging and review support.
- Viewer annotations and color-aware 3D previews for clearer design inspection.

### Changed
- Refined desktop rendering and project management to better match native OpenSCAD workflows.
- Reworked settings, customizer, diagnostics, and tool panels for a denser, more consistent editing experience.
- Expanded automated validation, CI coverage, and pull request preview tooling.

### Fixed
- Improved mobile viewing with better pinch zoom, panel behavior, and share-screen loading.
- Fixed export and save edge cases, including STL/customizer flows and 2D SVG defaults.
- Corrected formatter/parser issues, AI error handling, and other rendering stability problems.

Note: `1.0.0` was prepared but never published as a GitHub Release because the macOS release workflow failed. `1.0.1` ships the same product changes with the release pipeline fixed.

## [1.0.0] - 2026-04-02

### Added
- Multi-file project workflows with a file tree and workspace switching for larger OpenSCAD projects.
- Shareable design links with web loading, thumbnails, and better staging and review support.
- Viewer annotations and color-aware 3D previews for clearer design inspection.

### Changed
- Refined desktop rendering and project management to better match native OpenSCAD workflows.
- Reworked settings, customizer, diagnostics, and tool panels for a denser, more consistent editing experience.
- Expanded automated validation, CI coverage, and pull request preview tooling.

### Fixed
- Improved mobile viewing with better pinch zoom, panel behavior, and share-screen loading.
- Fixed export and save edge cases, including STL/customizer flows and 2D SVG defaults.
- Corrected formatter/parser issues, AI error handling, and other rendering stability problems.

## [0.13.1] - 2026-03-23

### Fixed
- Forward `notifyError` calls to Sentry for full exception tracking
- Prevent customizer parameter replacement from corrupting source code
- Filter DOM Event unhandled rejections and polyfill `Object.hasOwn` to reduce noise in error reporting

## [0.13.0] - 2026-03-20

### Changed
- Made AI First the default mode option in the NUX layout picker.

### Fixed
- Fixed the Tauri desktop window close permission configuration.

## [0.12.0] - 2026-03-18

### Added
- Added privacy-scrubbed Sentry error monitoring to improve crash visibility across the app.

### Changed
- Expanded product analytics coverage for viewer tools, customizer actions, settings interactions, and app errors.
- Improved analytics and release build reliability with supporting runtime and CI updates.

## [0.11.0] - 2026-03-18

### Added
- 3D viewer inspection tools including measurement, bounding-box, and section-plane controls
- New measurement tray, viewer context bar, and tool palette support across the viewer workflow
- Added customizer-first layout that will be used when sharing designs

### Changed
- Improved 2D and 3D viewer UI parity and supporting layout polish
- Refined customizer behavior, parsing, and parameter controls for a smoother editing flow

### Fixed
- Release asset upload paths in the release workflow

## [0.10.0] - 2026-03-15

### Added
- Rebuilt the 2D SVG viewer with parsed document metrics, adaptive overlays, and persistent viewer settings.
- Added geometry snapping, repeated measurements, millimeter distance labels, and 15 degree angle locking for 2D inspection work.

### Changed
- Improved 2D fit, zoom, and overlay behavior for more reliable fabrication-oriented previewing.
- Polished related workspace state and settings behavior to better support the updated viewer workflow.

### Fixed
- Preserved the PostHog project token during event sanitization so anonymous analytics continue to send correctly.
- Hardened release automation and targeted test flows for more reliable CI and publishing.

## [0.9.0] - 2026-03-13

Added privacy-aware product analytics with clear opt-out controls and stronger protection for AI conversation content.
Improved the AI chat experience with better streaming updates, attachment handling, tool-call state, and model/provider refresh behavior.
Upgraded the 3D viewer with configurable axes and axis labels, better framing behavior, and more reliable camera interactions.
Added stronger error handling with improved startup, app, and panel crash recovery states.
Expanded test coverage across analytics, AI, viewer behavior, and formatting regressions.
Fixed CI and e2e reliability issues, including the viewer settings toggle interaction used by automated tests.

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
