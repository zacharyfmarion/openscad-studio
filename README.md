# OpenSCAD Copilot

A modern cross-platform OpenSCAD editor with live preview and AI copilot, built with Tauri + React.

## Features

### Current (Phase 1 - Vertical Slice)
- ✅ Monaco code editor with OpenSCAD syntax highlighting
- ✅ Live preview with debounced rendering (300ms)
- ✅ Error/warning diagnostics with inline markers
- ✅ Auto-detect OpenSCAD installation
- ✅ Cross-platform (macOS, Windows, Linux)

### Coming Soon
- Three.js interactive 3D mesh viewer
- Backend detection (Manifold vs CGAL)
- 2D SVG preview mode
- LLM copilot for code generation & editing
- Export to STL, OBJ, AMF, 3MF, DXF
- Project file management
- Diff-based AI suggestions with rollback

## Prerequisites

1. **OpenSCAD** must be installed and available in your PATH
   - Download from https://openscad.org/
   - Or install via package manager:
     - macOS: `brew install openscad`
     - Ubuntu: `sudo apt install openscad`
     - Windows: Download installer from website

2. **Node.js** 18+ and **pnpm**
   ```bash
   npm install -g pnpm
   ```

3. **Rust** toolchain (for building Tauri backend)
   ```bash
   curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
   ```

## Development

```bash
# Install dependencies
pnpm install

# Run in development mode
pnpm tauri:dev

# Build for production
pnpm tauri:build
```

## Project Structure

```
openscad-copilot/
├── apps/
│   ├── ui/                 # React + Vite frontend
│   │   ├── src/
│   │   │   ├── api/        # Tauri IPC wrappers
│   │   │   ├── components/ # React components
│   │   │   ├── hooks/      # Custom React hooks
│   │   │   └── lib/        # Utilities
│   │   └── package.json
│   └── tauri/
│       └── src-tauri/      # Rust backend
│           ├── src/
│           │   ├── cmd/    # Tauri commands
│           │   ├── types/  # Rust type definitions
│           │   └── utils/  # Utilities (parser, cache, etc)
│           └── Cargo.toml
└── packages/
    └── shared/             # Zod schemas (shared TS types)
```

## Architecture

### Frontend (React + Monaco + Tailwind)
- Monaco editor with custom OpenSCAD language support
- Debounced rendering to avoid overwhelming OpenSCAD process
- Diagnostics panel showing errors/warnings from OpenSCAD stderr
- Preview pane displaying rendered PNG output

### Backend (Rust + Tauri)
- Spawns OpenSCAD as subprocess for each render
- Parses stderr for diagnostics using regex
- Manages temp files in app cache directory
- Future: caching, debouncing, LLM integration

### IPC Commands
- `locate_openscad` - Auto-detect OpenSCAD installation
- `render_preview` - Generate preview PNG/SVG
- `detect_backend` - Check for Manifold support (coming soon)

## Roadmap

### Phase 2: Advanced Rendering
- Interactive 3D mesh viewer (Three.js + STL loader)
- Backend detection and selection (Manifold/CGAL)
- 2D mode with SVG output
- Performance optimizations (caching, resolution scaling)

### Phase 3: LLM Copilot
- Server-side LLM integration (OpenAI/Anthropic)
- Diff-based code suggestions
- Safe apply/rollback workflow
- Context-aware prompting
- "Add", "Modify", "Explain" modes

### Phase 4: Production Polish
- Project management (multi-file support)
- Advanced editor features (formatting, linting)
- Measurement tools in 3D viewer
- Export to multiple formats
- E2E testing

## License

MIT

## Contributing

Contributions welcome! Please open an issue first to discuss major changes.
