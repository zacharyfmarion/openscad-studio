# Web + Desktop Architecture

Design document for running OpenSCAD Studio on **both** Tauri desktop (native OpenSCAD binary) and web browser (openscad-wasm), from a shared React codebase.

## Goals

1. **Desktop stays fast**: Native OpenSCAD binary, encrypted key storage, native file dialogs, native menus. Zero regression.
2. **Web works**: `openscad-wasm` in a Web Worker, browser-native file APIs, localStorage for settings.
3. **Shared UI**: React components, themes, Three.js viewer, Monaco editor — no duplication.
4. **Clean seam**: Components never import `@tauri-apps/*` directly. A platform abstraction makes the target invisible.

## Non-Goals

- Server-side rendering or server-hosted compute (the web version is fully client-side)
- Supporting openscad-wasm on desktop (desktop always uses native binary for performance)
- Mobile support (though the web version would technically work on tablets)

---

## High-Level Architecture

```
┌─────────────────────────────────────────────────────┐
│  React UI Layer (shared)                            │
│  Components, Hooks, Stores, Themes                  │
│  imports from: packages/platform                    │
└────────────────────┬────────────────────────────────┘
                     │ usePlatform() hook
          ┌──────────┴──────────┐
          ▼                     ▼
┌──────────────────┐  ┌──────────────────┐
│  TauriPlatform   │  │  WebPlatform     │
│  (desktop)       │  │  (browser)       │
│                  │  │                  │
│  ● Native binary │  │  ● WASM Worker   │
│  ● Tauri IPC     │  │  ● Fetch API     │
│  ● Encrypted     │  │  ● localStorage  │
│    store         │  │  ● File System   │
│  ● Native menus  │  │    Access API    │
│  ● Native FS     │  │  ● document.title│
└──────────────────┘  └──────────────────┘
```

### Build-Time Platform Selection

The platform implementation is selected at **build time** via Vite:

```
VITE_PLATFORM=tauri → imports packages/platform/src/tauri/index.ts
VITE_PLATFORM=web   → imports packages/platform/src/web/index.ts
```

Tree-shaking ensures only the active platform's code is bundled.

---

## Platform Interface

The full `Platform` interface lives in `packages/platform/src/types.ts`. Every hook and component interacts with the app through this interface.

```typescript
// packages/platform/src/types.ts

export interface Platform {
  /** Which platform is active */
  type: 'tauri' | 'web';

  rendering: RenderingService;
  fileSystem: FileSystemService;
  ai: AiService;
  storage: StorageService;
  conversations: ConversationService;
  history: HistoryService;
  window: WindowService;
}
```

### Rendering Service

Handles OpenSCAD compilation: preview rendering, export, and engine detection.

```typescript
export interface RenderResult {
  /** What kind of output was produced */
  kind: 'mesh' | 'png' | 'svg';
  /**
   * URL to the rendered output.
   * - Desktop: Tauri asset URL (file:// converted via convertFileSrc)
   * - Web: blob URL (URL.createObjectURL)
   */
  url: string;
  /** Parsed diagnostics from OpenSCAD stderr */
  diagnostics: Diagnostic[];
}

export interface RenderPreviewRequest {
  source: string;
  backend?: 'manifold' | 'cgal' | 'auto';
  view?: '2d' | '3d';
  size?: { w: number; h: number };
  render_mesh?: boolean;
  working_dir?: string;
}

export interface RenderExactRequest {
  source: string;
  backend?: 'manifold' | 'cgal' | 'auto';
  format: 'stl' | 'obj' | 'amf' | '3mf' | 'png' | 'svg' | 'dxf';
  /** Desktop: absolute file path. Web: suggested filename for download. */
  out_path: string;
  working_dir?: string;
}

export interface RenderExactResult {
  /**
   * - Desktop: file path where output was written
   * - Web: blob URL or triggers automatic download
   */
  path: string;
  diagnostics: Diagnostic[];
}

export interface EngineInfo {
  ready: boolean;
  version?: string;
  has_manifold?: boolean;
}

export interface RenderingService {
  /** Check if the rendering engine is available and get its capabilities */
  detectEngine(): Promise<EngineInfo>;

  /** Render a preview (PNG, SVG, or STL mesh) */
  renderPreview(request: RenderPreviewRequest): Promise<RenderResult>;

  /** Export to a specific format */
  renderExact(request: RenderExactRequest): Promise<RenderExactResult>;

  /** Get current diagnostics from last render */
  getDiagnostics(): Promise<Diagnostic[]>;

  /** Update the engine with current editor state (for AI tool access) */
  updateEditorState(code: string): Promise<void>;
}
```

**Key difference**: Desktop returns file paths converted to asset URLs. Web returns blob URLs from `Uint8Array` output. Both produce a `url: string` that ThreeViewer/SvgViewer can consume directly.

### File System Service

```typescript
export interface FileFilter {
  name: string;
  extensions: string[];
}

export interface OpenFileResult {
  /** Desktop: absolute file path. Web: synthetic path (filename). */
  path: string;
  content: string;
}

export interface FileSystemService {
  /** Show open file dialog, read and return contents */
  openFile(filters?: FileFilter[]): Promise<OpenFileResult | null>;

  /** Show save dialog and write content. Returns path or null if cancelled. */
  saveFile(content: string, path?: string | null, filters?: FileFilter[]): Promise<string | null>;

  /** Read file contents by path */
  readFile(path: string): Promise<string>;

  /** Write content to a file path */
  writeFile(path: string, content: string): Promise<void>;

  /** Whether this platform supports persistent file paths (desktop) or not (web) */
  supportsPersistentPaths: boolean;
}
```

**Desktop**: Uses `@tauri-apps/plugin-dialog` and `@tauri-apps/plugin-fs`.  
**Web**: Uses [File System Access API](https://developer.mozilla.org/en-US/docs/Web/API/File_System_Access_API) (`showOpenFilePicker`/`showSaveFilePicker`) in Chrome. Falls back to `<input type="file">` + download for Firefox/Safari.

### AI Service

```typescript
export interface StreamEvent {
  type: 'text' | 'tool-call' | 'tool-result' | 'error' | 'done';
  content?: string;
  toolName?: string;
  args?: Record<string, unknown>;
  result?: unknown;
  error?: string;
}

export interface LegacyMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  toolCalls?: Array<{
    name: string;
    args?: Record<string, unknown>;
    result?: unknown;
  }>;
}

export interface ModelInfo {
  id: string;
  display_name: string;
  provider: 'anthropic' | 'openai';
  model_type: 'alias' | 'snapshot';
  context_window?: number;
}

export interface AiService {
  /** Check if an API key is configured for any provider */
  hasApiKey(): Promise<boolean>;

  /** Store an API key for a provider */
  storeApiKey(provider: string, key: string): Promise<void>;

  /** Clear API key for a provider */
  clearApiKey(provider: string): Promise<void>;

  /** Get available providers that have API keys configured */
  getAvailableProviders(): Promise<string[]>;

  /** Send a query to the AI agent. Responses arrive via onStreamEvent. */
  sendQuery(
    messages: LegacyMessage[],
    model: string,
    provider: string,
    mode: string,
  ): Promise<void>;

  /** Cancel the current streaming query */
  cancelStream(): Promise<void>;

  /** Subscribe to stream events. Returns unsubscribe function. */
  onStreamEvent(handler: (event: StreamEvent) => void): () => void;

  /** Fetch available models from the provider */
  fetchModels(forceRefresh?: boolean): Promise<{ models: ModelInfo[]; from_cache: boolean }>;

  /** Validate that a model ID is still available */
  validateModel(modelId: string): Promise<{ is_valid: boolean; fallback_model?: string }>;

  /** Get the currently selected model */
  getModel(): Promise<string>;

  /** Set the current model */
  setModel(model: string): Promise<void>;
}
```

**Desktop**: Wraps existing Rust AI agent (Tauri IPC + `listen('ai-stream')`).  
**Web**: Makes direct `fetch()` calls to Anthropic/OpenAI APIs with SSE streaming. API keys stored in `localStorage`. Tool execution happens in-browser (calls `RenderingService` for compilation, etc.).

> **CORS note**: Anthropic's API supports browser CORS. OpenAI's does not by default. For OpenAI on web, options are: (1) proxy through a simple edge function, (2) only support Anthropic on web, or (3) user provides a CORS-enabled proxy URL. Recommend starting with Anthropic-only on web for simplicity.

### Storage Service

```typescript
export interface StorageService {
  /** Get a value from persistent storage */
  get<T>(key: string): Promise<T | null>;

  /** Set a value in persistent storage */
  set<T>(key: string, value: T): Promise<void>;

  /** Delete a key from storage */
  delete(key: string): Promise<void>;
}
```

**Desktop**: `tauri-plugin-store` (encrypted at rest).  
**Web**: `localStorage` with JSON serialization.

### Conversation Service

```typescript
export interface Conversation {
  id: string;
  title: string;
  timestamp: number;
  messages: Message[];
}

export interface ConversationService {
  save(conversation: Conversation): Promise<void>;
  loadAll(): Promise<Conversation[]>;
  delete(id: string): Promise<void>;
}
```

**Desktop**: Rust-backed file persistence (existing implementation).  
**Web**: `localStorage` or IndexedDB.

### History Service (Undo/Redo)

```typescript
export interface HistoryService {
  createCheckpoint(
    code: string,
    diagnostics: Diagnostic[],
    label: string,
    changeType: 'user' | 'ai',
  ): Promise<string>;

  undo(): Promise<{ code: string; diagnostics: Diagnostic[] } | null>;
  redo(): Promise<{ code: string; diagnostics: Diagnostic[] } | null>;
  canUndo(): Promise<boolean>;
  canRedo(): Promise<boolean>;
  restoreToCheckpoint(id: string): Promise<{ code: string } | null>;
  getCheckpointById(id: string): Promise<{ code: string; diagnostics: Diagnostic[] } | null>;
}
```

**Desktop**: Wraps existing Rust HistoryState (Tauri IPC).  
**Web**: In-memory implementation (same VecDeque logic, ported to TypeScript).

### Window Service

```typescript
export interface WindowService {
  /** Set the window/document title */
  setTitle(title: string): Promise<void>;

  /** Register a handler for close requests. Return false to prevent close. */
  onCloseRequested(handler: () => Promise<boolean>): () => void;

  /** Whether native menus are available */
  hasNativeMenus: boolean;
}
```

**Desktop**: `getCurrentWindow().setTitle()`, `onCloseRequested()`, native menus.  
**Web**: `document.title`, `window.onbeforeunload`, no native menus (use in-app menu bar).

---

## File Structure

```
packages/
  platform/
    package.json
    tsconfig.json
    src/
      index.ts                    # Re-exports: getPlatform(), PlatformProvider, usePlatform()
      types.ts                    # Platform interface and all service types
      context.ts                  # React context for platform injection

      tauri/
        index.ts                  # createTauriPlatform(): Platform
        rendering.ts              # TauriRenderingService
        fileSystem.ts             # TauriFileSystemService  
        ai.ts                     # TauriAiService (wraps existing Rust agent)
        storage.ts                # TauriStorageService (encrypted store)
        conversations.ts          # TauriConversationService
        history.ts                # TauriHistoryService
        window.ts                 # TauriWindowService

      web/
        index.ts                  # createWebPlatform(): Platform
        rendering.ts              # WebRenderingService (openscad-wasm worker)
        fileSystem.ts             # WebFileSystemService (File System Access API)
        ai.ts                     # WebAiService (direct fetch to API)
        storage.ts                # WebStorageService (localStorage)
        conversations.ts          # WebConversationService (localStorage/IndexedDB)
        history.ts                # WebHistoryService (in-memory)
        window.ts                 # WebWindowService (document.title)
        worker/
          openscad.worker.ts      # Web Worker: loads openscad-wasm, handles render requests
          worker-types.ts         # Message types for worker communication

apps/
  ui/
    src/
      api/
        tauri.ts                  # DEPRECATED — replaced by packages/platform/src/tauri/*
      hooks/
        useOpenScad.ts            # Refactored to use usePlatform().rendering
        useAiAgent.ts             # Refactored to use usePlatform().ai
      main.tsx                    # Wraps <App> in <PlatformProvider>
      ...
```

### What Moves vs. What Stays

| Current Location | Action |
|---|---|
| `apps/ui/src/api/tauri.ts` | Logic moves to `packages/platform/src/tauri/`. File kept as re-exports during migration, then removed. |
| `apps/ui/src/hooks/useOpenScad.ts` | Refactored: replace `import { renderPreview } from '../api/tauri'` with `usePlatform().rendering.renderPreview()` |
| `apps/ui/src/hooks/useAiAgent.ts` | Refactored: replace `invoke()`/`listen()` calls with `usePlatform().ai.*` |
| `apps/ui/src/App.tsx` | Refactored: replace Tauri file dialog imports, `convertFileSrc`, `getCurrentWindow` with platform equivalents |
| `apps/ui/src/components/*` | **No changes** — components receive data via hooks/context, don't import platform code |
| `apps/ui/src-tauri/` | **No changes** — Rust backend stays as-is |

---

## React Integration

### Platform Provider

```typescript
// packages/platform/src/context.ts
import { createContext, useContext } from 'react';
import type { Platform } from './types';

const PlatformContext = createContext<Platform | null>(null);

export const PlatformProvider = PlatformContext.Provider;

export function usePlatform(): Platform {
  const platform = useContext(PlatformContext);
  if (!platform) {
    throw new Error('usePlatform() must be used within a PlatformProvider');
  }
  return platform;
}
```

### Entry Point

```typescript
// apps/ui/src/main.tsx
import { createPlatform } from '@openscad-studio/platform';

const platform = await createPlatform();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <PlatformProvider value={platform}>
    <App />
  </PlatformProvider>
);
```

### Platform Factory

```typescript
// packages/platform/src/index.ts
export async function createPlatform(): Promise<Platform> {
  if (import.meta.env.VITE_PLATFORM === 'web') {
    const { createWebPlatform } = await import('./web/index.js');
    return createWebPlatform();
  } else {
    const { createTauriPlatform } = await import('./tauri/index.js');
    return createTauriPlatform();
  }
}

export { PlatformProvider, usePlatform } from './context.js';
export type { Platform } from './types.js';
```

---

## Web Worker Design (openscad-wasm)

The web rendering service communicates with a dedicated Web Worker:

```
Main Thread                         Web Worker
───────────                         ──────────
WebRenderingService                 openscad.worker.ts
  │                                   │
  │─── { type: 'init' } ────────────→│ Load openscad-wasm (~13MB)
  │←── { type: 'ready' } ────────────│
  │                                   │
  │─── { type: 'render',             │
  │      source: '...',              │
  │      args: [...] } ──────────────→│ FS.writeFile → callMain → FS.readFile
  │←── { type: 'result',             │
  │      output: Uint8Array,         │
  │      diagnostics: [...] } ───────│
  │                                   │
  │─── { type: 'render',             │
  │      source: '...',              │
  │      format: 'stl' } ───────────→│
  │←── { type: 'result',             │
  │      output: Uint8Array } ───────│
```

### Worker Message Types

```typescript
// packages/platform/src/web/worker/worker-types.ts

export type WorkerRequest =
  | { type: 'init' }
  | { type: 'render'; id: string; source: string; args: string[]; outputFile: string }

export type WorkerResponse =
  | { type: 'ready'; version: string }
  | { type: 'result'; id: string; output: Uint8Array; stderr: string }
  | { type: 'error'; id: string; error: string }
```

### Diagnostics Parsing

The OpenSCAD stderr parser currently lives in Rust (`utils/parser.rs`). For web, we need a TypeScript port. This is a regex-based parser — straightforward to port:

```typescript
// packages/platform/src/web/diagnostics.ts
// Port of apps/ui/src-tauri/src/utils/parser.rs
export function parseOpenScadStderr(stderr: string): Diagnostic[] {
  // Same regex patterns as the Rust implementation
  // ...
}
```

---

## Build Configuration

### Vite Config Changes

```typescript
// apps/ui/vite.config.ts
export default defineConfig(({ mode }) => {
  const platform = process.env.VITE_PLATFORM || 'tauri';

  return {
    plugins: [react()],
    define: {
      'import.meta.env.VITE_PLATFORM': JSON.stringify(platform),
    },
    resolve: {
      alias: {
        // Ensure platform package resolves correctly
        '@openscad-studio/platform': path.resolve(__dirname, '../../packages/platform/src'),
      },
    },
    // Web-specific: include openscad-wasm as a dependency
    ...(platform === 'web' && {
      optimizeDeps: {
        exclude: ['web-tree-sitter', 'openscad-wasm'],
      },
      worker: {
        format: 'es',
      },
    }),
    // Tauri-specific settings preserved
    ...(platform === 'tauri' && {
      clearScreen: false,
      server: {
        port: 1420,
        strictPort: true,
        // ... existing Tauri config
      },
    }),
  };
});
```

### Package Scripts

```json
// root package.json
{
  "scripts": {
    "dev": "cd apps/ui && pnpm dev",
    "dev:web": "cd apps/ui && VITE_PLATFORM=web pnpm dev",
    "build": "cd apps/ui && pnpm build",
    "build:web": "cd apps/ui && VITE_PLATFORM=web pnpm build",
    "tauri:dev": "cd apps/ui && pnpm tauri dev",
    "tauri:build": "cd apps/ui && pnpm tauri build"
  }
}
```

### Web-only Dependencies

```json
// packages/platform/package.json (new)
{
  "dependencies": {
    "openscad-wasm": "^0.0.4"
  }
}
```

`openscad-wasm` is only bundled in the web build (tree-shaken out of Tauri build since the web/ folder is never imported).

---

## Migration Plan

Each phase is independently shippable. Desktop never regresses.

### Phase 1: Create Platform Package + Types

**Effort**: Small  
**Risk**: None (additive, no existing code changes)

1. Create `packages/platform/` with `package.json`, `tsconfig.json`
2. Write `types.ts` with all interfaces
3. Write `context.ts` with `PlatformProvider` and `usePlatform()`
4. Write `index.ts` with `createPlatform()` factory

### Phase 2: Tauri Platform Implementation

**Effort**: Medium  
**Risk**: Low (wrapping existing code)

1. Create `tauri/rendering.ts` — wraps existing `invoke('render_preview')`, `invoke('render_exact')`, etc.
2. Create `tauri/fileSystem.ts` — wraps `@tauri-apps/plugin-dialog` and `@tauri-apps/plugin-fs`
3. Create `tauri/ai.ts` — wraps existing `invoke()` + `listen('ai-stream')` calls
4. Create `tauri/storage.ts` — wraps `tauri-plugin-store`
5. Create `tauri/conversations.ts` — wraps existing conversation commands
6. Create `tauri/history.ts` — wraps existing history commands
7. Create `tauri/window.ts` — wraps `getCurrentWindow()`
8. Create `tauri/index.ts` — assembles `createTauriPlatform()`

### Phase 3: Refactor Hooks to Use Platform

**Effort**: Medium  
**Risk**: Medium (touching core hooks, but mechanically replacing imports)

1. Update `main.tsx` to wrap app in `PlatformProvider`
2. Refactor `useOpenScad.ts` — replace all `import ... from '../api/tauri'` with `usePlatform()`
3. Refactor `useAiAgent.ts` — replace all `invoke()` / `listen()` with `usePlatform().ai.*`
4. Refactor `App.tsx` — replace direct Tauri imports with platform equivalents
5. Delete or deprecate `apps/ui/src/api/tauri.ts`
6. **Verify**: Desktop works identically. Run through full workflow.

### Phase 4: Web Rendering (openscad-wasm)

**Effort**: Medium  
**Risk**: Medium (new territory)

1. Create `web/worker/openscad.worker.ts` — loads `openscad-wasm`, handles render messages
2. Create `web/rendering.ts` — communicates with worker, returns blob URLs
3. Port `parseOpenScadStderr()` from Rust to TypeScript
4. Create `web/diagnostics.ts` with the parser
5. Test: SCAD code → STL blob → ThreeViewer renders it

### Phase 5: Web File System + Storage

**Effort**: Small  
**Risk**: Low

1. Create `web/fileSystem.ts` — File System Access API + fallbacks
2. Create `web/storage.ts` — localStorage wrapper
3. Create `web/conversations.ts` — localStorage for conversations
4. Create `web/history.ts` — in-memory undo/redo (TypeScript port)
5. Create `web/window.ts` — document.title, beforeunload

### Phase 6: Web AI Agent

**Effort**: Medium-Large  
**Risk**: Medium (CORS considerations, streaming in browser)

1. Create `web/ai.ts` — direct `fetch()` to Anthropic API with SSE parsing
2. Implement tool execution in browser (calls `WebRenderingService` for compile/diagnostics)
3. System prompt: reuse same prompt from Rust (copy to shared constant)
4. Handle API key storage in localStorage (with clear warnings about security)
5. Start with Anthropic-only. Add OpenAI later (needs CORS proxy).

### Phase 7: Vite Config + Polish

**Effort**: Small  
**Risk**: Low

1. Update `vite.config.ts` for dual-target builds
2. Add `pnpm dev:web` and `pnpm build:web` scripts
3. Handle web-specific UI differences:
   - No native menus → in-app menu bar or simplified header
   - No `OpenScadSetupScreen` (WASM is always available)
   - File "paths" are just filenames on web
   - Export = download to browser's download folder
4. Test full workflow in Chrome, Firefox, Safari

---

## What Changes Per Component

| Component | Desktop | Web | Changes Needed |
|---|---|---|---|
| `Editor.tsx` | Monaco editor | Same | None |
| `ThreeViewer.tsx` | Loads STL from asset URL | Loads STL from blob URL | None (both are URLs) |
| `SvgViewer.tsx` | Loads SVG from asset URL | Loads SVG from blob URL | None (both are URLs) |
| `AiPromptPanel.tsx` | Renders messages/tools | Same | None |
| `SettingsDialog.tsx` | Encrypted API key storage | localStorage warning | Minor: show security note on web |
| `ExportDialog.tsx` | Save to disk | Download file | Minor: different UX text |
| `WelcomeScreen.tsx` | Recent files from disk | Recent files from localStorage | Minor: source differs |
| `OpenScadSetupScreen.tsx` | Shows when OpenSCAD not found | Not shown (WASM always available) | Conditionally rendered |
| `TabBar.tsx` | File paths in tabs | Filenames only | Minor |
| `MenuBar.tsx` (new) | Not needed (native menus) | Needed for web | New component for web only |

---

## Open Questions

1. **AI on web — Anthropic-only?** Anthropic supports browser CORS. OpenAI does not. Should we support only Anthropic on web, or build a lightweight CORS proxy?

2. **AI tool: get_preview_screenshot on web?** Desktop returns a file path the AI model can reference. On web, we'd need to return a base64 data URL or skip this tool. Could return "screenshot not available in web mode" and let the AI work without it.

3. **Working directory / relative imports on web?** Desktop resolves `use <file.scad>` via working_dir. On web, there's no real filesystem. Options: (a) single-file only on web, (b) let user upload a folder, (c) virtual filesystem in the worker. Start with (a).

4. **WASM bundle size**: The `openscad-wasm` package is ~13MB uncompressed. With gzip/brotli it compresses to ~3-4MB. Is a loading spinner acceptable on first load? Should we lazy-load it?

5. **Web deployment**: Static files to GitHub Pages? Vercel? Netlify? Or just document how to self-host?

---

## Success Criteria

- [ ] `pnpm tauri:dev` works exactly as before (zero regression)
- [ ] `pnpm dev:web` serves a working web version
- [ ] Web: Can type OpenSCAD code and see live 3D preview
- [ ] Web: Can export STL/OBJ/SVG (downloads to browser)
- [ ] Web: AI chat works (at least with Anthropic)
- [ ] Web: Settings persist across page reloads
- [ ] No `@tauri-apps/*` imports outside of `packages/platform/src/tauri/`
- [ ] Components in `apps/ui/src/components/` have zero platform-specific imports
