# OpenSCAD Studio — Product Roadmap

> **Vision**: The easiest way to go from an idea to a 3D-printable design.
>
> OpenSCAD is the engine, not the product. The product is: you describe what you want, it makes it, you print it.

**Current version**: v1.2.1 | **Last updated**: 2026-04-19

This roadmap mixes shipped milestones with future planning. Older sections may describe the implementation assumptions that existed when they were written rather than the current client-side `openscad-wasm` architecture.

---

## Guiding Principles

1. **AI is the product, the editor is the vehicle.** Every feature should be evaluated by: does this make the idea → printed object loop faster or more accessible?
2. **Expand the market, don't just serve it.** The audience is anyone with a 3D printer, not just people who already know OpenSCAD. Lower the floor, not just raise the ceiling.
3. **Web-first distribution.** The web app is the top of funnel. Zero friction to try. Desktop is for power users who want local files and library management.
4. **Ship what's visible.** Internal refactors happen when they unblock user-facing features, not as standalone phases.
5. **Stay open source.** This is a community project. Optimize for reach, adoption, and quality — not revenue.

---

## What We Have (v1.2.1)

| Area                                                                                  | Status |
| ------------------------------------------------------------------------------------- | ------ |
| Monaco editor with OpenSCAD syntax, 27 themes, vim mode, tree-sitter formatting       | ✅     |
| Live 3D preview (Three.js mesh viewer, orbit controls, wireframe/solid/section tools) | ✅     |
| 2D SVG mode for laser cutting / engraving                                             | ✅     |
| AI copilot (Claude + GPT, streaming, tool-calling, diff-based editing, image attachments, auto-rollback) | ✅     |
| AI can see the 3D preview (screenshot tool returns base64 PNG to vision models)       | ✅     |
| Customizer panel (tree-sitter parsed parameters → sliders, dropdowns, vectors)        | ✅     |
| Share links with remixable web entry and thumbnail support                            | ✅     |
| Product analytics controls and privacy-scrubbed Sentry monitoring                     | ✅     |
| 2D/3D measurement tools and 3D section plane controls                                 | ✅     |
| Export (STL, OBJ, AMF, 3MF, PNG, SVG, DXF)                                            | ✅     |
| Web app via openscad-wasm (zero install, Cloudflare Pages)                            | ✅     |
| Desktop app (macOS, Homebrew)                                                         | ✅     |
| Library path management, include/use resolution, BOSL2 support                        | ✅     |
| Multi-tab editing, undo/redo checkpoints, conversation persistence                    | ✅     |
| E2E test suite (Playwright, ~2700 lines, CI on every PR)                              | ✅     |

---

## Phase 1: AI-First Creation Experience

> **Goal**: Make it so someone who's never written OpenSCAD can open the app and walk away with a printable STL in under 5 minutes.

### 1.1 Image Input for AI

Let users paste/drag-drop a photo, sketch, or reference image into the AI chat. "Make something like this" becomes a real workflow.

- [ ] Image paste support in AI prompt textarea (clipboard)
- [ ] Drag-and-drop image files onto the chat
- [ ] File picker button for image selection
- [ ] Display image thumbnails in message history
- [ ] Send as image content blocks to vision models (Anthropic + OpenAI both support this)
- [ ] Use case: "Here's a photo of the bracket I need — make this in OpenSCAD"

### 1.2 Prompt Templates & One-Click Generation

Pre-built prompts for the most common things people make. Reduce "blank canvas" paralysis.

- [ ] Template picker in AI prompt area (button or `/` command)
- [ ] Categories:
  - **Enclosures**: "Parametric box with lid", "Raspberry Pi case", "Custom electronics enclosure"
  - **Mechanical**: "Gear with N teeth", "Bearing holder", "Hinge mechanism"
  - **Home/Office**: "Phone stand", "Cable organizer", "Shelf bracket", "Hook"
  - **3D Printing**: "Calibration cube", "Test print", "Tolerance test"
- [ ] Templates inject into prompt textarea — user can customize before sending
- [ ] Each template includes sensible defaults and parameter suggestions
- [ ] Templates stored as JSON resource, easy to expand

### 1.3 Example Gallery

Show people what's possible. Every example is a learning opportunity and a starting point.

- [ ] Gallery view accessible from welcome screen and menu
- [ ] Curated collection of 15-20 designs across difficulty levels:
  - Beginner: simple shapes, basic parametric objects
  - Intermediate: multi-part assemblies, mechanical components
  - Advanced: complex geometry, BOSL2 usage
- [ ] One-click "Open in Editor" loads the code and renders preview
- [ ] Each example includes a description and suggested modifications
- [ ] Source files bundled with the app (not fetched remotely)

### 1.4 Guided First-Run Experience

The first 60 seconds determine whether someone stays. Optimize this ruthlessly.

- [ ] Detect first-time user (no conversations, no recent files)
- [ ] Offer guided paths:
  - "Describe something you want to make" → opens AI chat with context
  - "Browse example designs" → opens gallery
  - "Start from scratch" → blank editor (current behavior)
- [ ] If no API key: streamlined setup flow with "why you need this" context
- [ ] Show a 30-second interactive walkthrough of the AI workflow (optional, skippable)

**Success criteria**: A non-OpenSCAD user can go from opening the app to holding an STL file in 5 minutes.

---

## Phase 2: Shareable Designs & Distribution

> **Goal**: Make every design a growth vector. "Look what I made" should be a link that opens the editor.

### 2.1 Share Designs via URL

- [ ] "Share" button generates a URL with the source code encoded (gzip + base64 in URL hash, or short-code via paste service)
- [ ] Opening a shared link loads the design in the web editor with live preview
- [ ] Shared view shows: rendered preview, source code, "Remix this" button
- [ ] Social meta tags (OpenGraph) so shared links show a preview image on Twitter/Discord/Reddit
- [ ] Size limit: designs up to ~50KB source code (covers 99% of use cases)

### 2.2 SEO Landing Pages

Drive organic search traffic to the web app with purpose-built pages.

- [ ] Landing pages for high-search-volume queries:
  - "Parametric box generator"
  - "OpenSCAD gear generator"
  - "Custom enclosure designer"
  - "3D printable bracket maker"
- [ ] Each page: pre-loaded design in the editor, customizer visible, "Download STL" prominent
- [ ] User can modify parameters via customizer without writing any code
- [ ] Pages are static HTML (good for SEO) that boot the full app on interaction

### 2.3 Customizer-First Mode

For shared designs and landing pages, the customizer should be primary — not the code editor.

- [ ] "Customizer mode" layout: large preview + customizer panel, code editor collapsed/hidden
- [ ] Big "Download STL" button
- [ ] Ideal for non-programmers who just want to tweak dimensions and print
- [ ] Toggle to switch to full editor mode for power users

**Success criteria**: Shared designs get engagement. Landing pages rank for target queries. Non-programmers can use the customizer to get printable results.

---

## Phase 3: Cross-Platform Desktop

> **Goal**: Don't lose 60%+ of potential desktop users because they're not on macOS.

### 3.1 Windows Support

- [ ] Test desktop filesystem, library path, and export workflows on Windows
- [ ] Fix path handling (backslashes, drive letters)
- [ ] Verify keyboard shortcuts (Ctrl vs ⌘)
- [ ] MSI installer via Tauri bundler
- [ ] Code signing with Windows certificate
- [ ] Test on Windows 10 and 11

### 3.2 Linux Support

- [ ] Test desktop filesystem, library path, and export workflows on Linux
- [ ] AppImage build
- [ ] .deb package for Ubuntu/Debian
- [ ] Test on Ubuntu 22.04 and Fedora 39+
- [ ] Verify file dialogs work with various desktop environments

### 3.3 Auto-Update

- [ ] Enable Tauri's built-in updater plugin
- [ ] GitHub Releases as update source
- [ ] In-app notification: "A new version is available" with changelog
- [ ] One-click update + restart

**Success criteria**: App installs and works on Windows, Linux, and macOS. Auto-update keeps users current.

---

## Phase 4: Smarter AI

> **Goal**: Make the AI a genuine design partner, not just a code generator.

### 4.1 Multi-File Project Context

The AI should understand the full project, not just the active file.

- [ ] Include referenced files (`use`/`include`) in AI system prompt as context
- [ ] Add `explore_project` AI tool that lists files in the working directory
- [ ] Limit context to files actually referenced (don't dump entire directories)
- [ ] AI can suggest creating helper modules and splitting complex designs

### 4.2 3D-Printing-Aware AI

Bake domain knowledge into the AI so it produces print-ready designs.

- [ ] System prompt additions:
  - Common 3D printing constraints (overhangs, bridging, minimum wall thickness)
  - FDM vs resin considerations
  - Tolerance guidelines for press fits, snap fits, hinges
  - Support structure avoidance patterns
- [ ] Prompt templates for print-specific tasks:
  - "Add fillets for printability"
  - "Optimize for printing without supports"
  - "Add snap-fit joints"
  - "Check dimensions for [specific printer build volume]"

### 4.3 Conversation History Sidebar

- [ ] Dockview panel listing saved conversations (title, date, message count)
- [ ] Click to load, delete with confirmation, search across titles
- [ ] Backend already supports `save_conversation`, `load_conversations`, `delete_conversation`
- [ ] Frontend just needs the UI

### 4.4 Configurable Edit Size Limit

- [ ] Move 120-line edit limit to a user setting
- [ ] Default: 120 lines (current behavior)
- [ ] Allow increase to 250 or 500 for users who want full-file generation
- [ ] Setting in Settings → AI tab

**Success criteria**: AI produces print-ready designs. Users can manage conversation history. Multi-file projects work with AI.

---

## Phase 5: Viewer & CAD Features

> **Goal**: Make the preview good enough that users don't need to open another tool before printing.

### 5.1 Adaptive Render Resolution

- [ ] Replace hardcoded 800x600 with actual panel dimensions
- [ ] `ResizeObserver` on preview panel
- [ ] Cap at 2x device pixel ratio for retina displays
- [ ] Debounce resize-triggered re-renders (300ms)

### 5.2 Measurement Tools

Essential for verifying that dimensions are correct before printing.

- [ ] Bounding box dimensions (toggle X/Y/Z extent labels)
- [ ] Point-to-point distance measurement (click two points on mesh)
- [ ] Snap to vertices
- [ ] Three.js raycasting for point picking

### 5.3 Section / Clipping Plane

- [ ] Toggle button: "Section Plane" in 3D viewer toolbar
- [ ] Draggable clipping plane using `THREE.Plane`
- [ ] Useful for inspecting hollow objects, internal cavities, fit checks

### 5.4 Color Support

- [ ] Parse `color()` calls from OpenSCAD source
- [ ] Evaluate AMF/3MF format (supports colors) for preview instead of STL
- [ ] Minimum viable: single-color override from first `color()` call

**Success criteria**: Users can verify their designs are dimensionally correct and inspect internal geometry without leaving the app.

---

## Phase 6: Editor Intelligence (Targeted)

> **Goal**: Make the editor smart enough to be helpful, without trying to out-IDE VS Code.

### 6.1 Hover Documentation for Builtins

- [ ] Hover over `cube`, `sphere`, `translate`, etc. shows signature + parameter descriptions
- [ ] Source: embedded OpenSCAD cheat sheet data as JSON
- [ ] Register as Monaco `HoverProvider`

### 6.2 Improved Autocomplete

- [ ] Complete user-defined module and function names
- [ ] Complete variable names from current scope
- [ ] Context-aware: inside `color("...")` → suggest named colors
- [ ] Rank by usage frequency

### 6.3 Basic Linting

- [ ] Undefined variable references (warning)
- [ ] Module arity mismatches (wrong number of arguments)
- [ ] Use tree-sitter AST (already available)
- [ ] Display as Monaco warning markers alongside compile errors

**Out of scope** (VS Code handles these better): full LSP, go-to-definition across files, refactoring tools, symbol rename. If users want those, they should use VS Code with an OpenSCAD extension for editing, and OpenSCAD Studio for preview + AI.

---

## Phase 7: Community & Content

> **Goal**: Build a flywheel where users create content that attracts more users.

### 7.1 Community Prompt Library

- [ ] Submit and browse prompt templates contributed by the community
- [ ] Upvote/favorite system
- [ ] Categories: mechanical, decorative, functional, educational

### 7.2 Design Showcase

- [ ] Curated gallery of community-created designs (submitted via GitHub PR or form)
- [ ] Each design: preview image, source code, link to open in editor
- [ ] "Made with OpenSCAD Studio" badge for social sharing

### 7.3 Tutorial Content

- [ ] Interactive tutorials built into the app:
  - "Your first parametric design" (15 min)
  - "Using AI to iterate on a design" (10 min)
  - "Designing for 3D printing" (20 min)
- [ ] Step-by-step with live preview at each step

---

## Parking Lot (Valuable but Not Now)

These are interesting but premature given current priorities and user base size. Revisit when there's clear demand.

| Feature                                 | Reason to Wait                                                           |
| --------------------------------------- | ------------------------------------------------------------------------ |
| **Offline LLM** (llama.cpp)             | Niche of a niche. Local models aren't good enough at OpenSCAD yet.       |
| **Plugin system**                       | No user base to sustain an ecosystem.                                    |
| **Collaborative editing** (CRDT/Yjs)    | Massive engineering cost, unclear demand for CAD collaboration.          |
| **Full language server**                | VS Code does this better. Focus on what VS Code can't do.                |
| **App.tsx decomposition** (4B.1)        | Important tech debt but invisible to users. Do when it blocks a feature. |
| **Centralized state management** (4B.3) | Same — do when the current approach actively causes bugs.                |

---

## Technical Debt (Address Opportunistically)

Don't schedule these as standalone work items. Fix them when they're in the critical path of a feature.

| Issue                                            | Severity | Trigger to Fix                                                  |
| ------------------------------------------------ | -------- | --------------------------------------------------------------- |
| App.tsx is 1189 lines                            | Medium   | When adding a feature that touches App.tsx and it's too painful |
| Refs-as-state anti-pattern (7+ refs)             | Medium   | When a state bug is traced to this pattern                      |
| EditorState duplication (frontend + backend)     | Medium   | When AI context or multi-file features need coherent state      |
| Settings split across localStorage + Tauri store | Low      | When adding new settings gets confusing                         |
| Error boundary only at top level                 | Low      | When a panel crash takes down the whole app                     |
| DiffViewer shows same code for old/new           | Low      | When someone actually uses the diff panel                       |

---

## Success Metrics

### North Star

**Time from "I want to make X" to downloadable STL** — target: under 5 minutes for simple designs.

### Leading Indicators

- Web app weekly active users (Plausible analytics)
- AI conversations started per session
- STL exports per session (= user got a result they wanted)
- Shared design links generated
- GitHub stars (community signal)

### Quality Indicators

- AI success rate (edits that compile on first try)
- Time to first render (app load performance)
- Session duration (engagement)
- Return visits within 7 days (retention)

---

## Decision Log

1. **"Anyone with a 3D printer" over "OpenSCAD power users."** The market of people who want to make things is 100x larger than the market of people who already know OpenSCAD. The AI can bridge the knowledge gap. Build for the larger market.

2. **Free and open source, no monetization.** This is a community project. Optimize for reach and quality. BYOK (bring your own API key) for AI means no operational costs beyond hosting the web app.

3. **AI vision already works — lean into it.** The `get_preview_screenshot` tool already captures the preview as base64 PNG and sends it to vision-capable models. This means the AI can already "see" the design and iterate visually. This is a massive differentiator that should be front-and-center in marketing.

4. **Don't out-IDE VS Code.** Full language server, go-to-definition across files, and advanced refactoring are losing battles against VS Code's ecosystem. Instead, do the things VS Code can't: deep AI + rendering integration, customizer UI, zero-install web app.

5. **Web-first distribution.** The web app is the top of funnel. Every feature should work on web first (or simultaneously). Desktop is for power users who want local files, library management, and native performance.

6. **Templates and examples before editor intelligence.** A curated prompt template that generates a working gear in one click is worth more to a new user than go-to-definition or hover docs. Invest in content before tooling.
