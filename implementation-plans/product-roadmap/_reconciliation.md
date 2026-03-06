# Engineering Reconciliation: Cross-Plan Compatibility Analysis

This document analyzes all 26 implementation plans for engineering compatibility, identifying shared infrastructure, dependency ordering, potential conflicts, and recommended implementation sequencing.

---

## 1. Shared Infrastructure Dependencies

### 1.1 Tree-sitter OpenSCAD Parser (Critical — 4 plans depend on this)

**Used by:** 7.1 (Linting), 7.2 (Go-to-Definition), 7.3 (Hover Docs), 7.4 (Autocomplete)
**Also useful for:** 6.3 (Color parsing), 6.5 (Operator parsing)

**Current state:** The roadmap mentions Tree-sitter is "already available for formatting" — needs verification.

**Required shared service: `OpenScadParser`**
All four Phase 7 features need identical infrastructure:

- WASM Tree-sitter initialization (once per app session)
- `tree-sitter-openscad.wasm` grammar bundled as app asset
- Incremental parsing: `parse(text, previousTree?, edits?) → Tree`
- UTF-16 ↔ byte offset conversion (Tree-sitter byte-based; Monaco UTF-16)
- Per-model parse cache keyed by `model.getVersionId()`

**Reconciliation action:**

- Build `OpenScadParser` service **once** before any Phase 7 work begins.
- This service should also produce a shared `SymbolIndex` and `ScopeIndex` that all four features consume — **do not** have each feature build its own index from scratch.
- The scope model (global/module/function/let/for) must be defined once and shared. Plans 7.1 and 7.2 both describe this independently; they must use the same implementation.

**Risk if not reconciled:** Each Phase 7 feature independently initializes Tree-sitter, builds its own scope model, and defines its own built-in tables — leading to 4x code, inconsistent behavior, and O(4N) parsing overhead.

### 1.2 Zustand Store Architecture (Critical — 6+ plans affected)

**Primary:** 4B.3 (Centralized State Management) — defines `useEditorState`
**Consumers:** 4B.2 (Error Boundaries → `panelErrorStore`), 5.1 (Conversation History → `conversationHistoryStore`), 5.4 (Templates → template store), 5.5 (Edit Size Limit → `settingsStore.ai.maxEditLines`)

**Reconciliation concerns:**

1. **4B.3 `useEditorState` must be designed before 4B.2, 5.1, and 5.4** because those stores need to coexist and follow the same Zustand patterns (vanilla `createStore` + `useStore` selector pattern vs. hooks-based).
2. **4B.3 defines `doc.code` as source of truth**, which changes how 5.2 (Image Input), 5.3 (Multi-File Context), and 5.5 (Edit Size) interact with the AI tools — they all need to read from `editorStore` rather than `sourceRef`.
3. **Store naming convention**: plans independently propose `panelErrorStore`, `conversationHistoryStore`, and template stores. These should follow a consistent naming pattern: `use<Domain>Store` or `<domain>Store`.
4. **`settingsStore` migration**: Currently uses custom `useSyncExternalStore`, not Zustand. Plan 5.5 adds `ai.maxEditLines` to it. Decision needed: migrate `settingsStore` to Zustand as part of 4B.3, or keep it separate?

**Recommendation:**

- Implement 4B.3 first and establish patterns.
- Other stores (4B.2, 5.1, 5.4) follow the same patterns.
- Keep `settingsStore` as-is for now (it works); add `ai.maxEditLines` to it using the existing pattern.

### 1.3 PlatformBridge Extensions (5+ plans need additions)

**Plans requiring PlatformBridge changes:**

- 5.2 (Image Input): image capture/storage methods
- 5.3 (Multi-File Context): `listProjectFiles()`, `readFile()` for AI context
- 8.1 (Windows): OpenSCAD detection, path normalization
- 8.2 (Linux): OpenSCAD detection, file dialogs
- 10.2 (Offline LLM): `LocalLlamaCppProvider` as new provider type

**Reconciliation concerns:**

1. **Interface growth**: PlatformBridge is already the primary abstraction seam. Each plan adds methods independently. Without coordination, the interface bloats.
2. **4B.3 recommends a separate `editorSync` module** rather than putting editor sync into PlatformBridge. This is the right pattern — keep domain-specific concerns in domain-specific modules, not in a god interface.
3. **10.2 adds a new provider type** (`LocalLlamaCppProvider`) which is fundamentally different from cloud providers. This should be a separate abstraction (provider registry), not shoehorned into PlatformBridge.

**Recommendation:**

- Keep PlatformBridge for filesystem/menu/window/dialog concerns.
- Add new abstractions for: `EditorSyncService` (4B.3), `AiProviderRegistry` (10.2), `ProjectFileService` (5.3).
- Don't let PlatformBridge become a god object.

### 1.4 Built-in Symbol Tables (3 plans need the same data)

**Used by:** 7.1 (Linting — `lint/builtins.ts`), 7.2 (Go-to-Definition — `builtinSymbols: Set`), 7.3 (Hover Docs — `openscad-builtins.json`), 7.4 (Autocomplete — built-in catalog)

All four plans independently define lists of OpenSCAD built-in modules, functions, and special variables. These must be **one canonical source**:

```
packages/shared/src/openscad-builtins.json (or .ts)
```

This single file should contain:

- All built-in module names, signatures, parameters, documentation
- All built-in function names, signatures, documentation
- All special variables (`$fn`, `$fa`, etc.)
- Deprecated built-ins with replacement info

Each consumer (linter, definition provider, hover, autocomplete) reads from this one source.

**Risk if not reconciled:** Four separate hardcoded lists that drift apart over time.

---

## 2. ThreeViewer.tsx Convergence (Critical — 5 plans modify this file)

**Plans modifying ThreeViewer:**

- 6.1 (Adaptive Resolution): `ResizeObserver` + dynamic render size
- 6.2 (Clipping Plane): `THREE.Plane` + `TransformControls` + gizmo
- 6.3 (Color Support): material color override from source parsing
- 6.4 (Measurement Tools): `MeasurementController` + `CSS2DRenderer` + overlay group
- 6.5 (Special Operators): multi-mesh composition + overlay materials

**Conflicts identified:**

### 2.1 Material Management

- **6.3** wants to override the base material color based on `color()` calls.
- **6.5** wants separate materials for normal/highlight/background meshes.
- **6.2** wants to set `material.side = DoubleSide` when clipping is active and restore on disable.
- All three touch `MeshStandardMaterial` on the same mesh.

**Resolution:** Implement a `MaterialManager` that:

- Holds base material properties (color from 6.3, side from 6.2)
- Creates variant materials for operator overlays (6.5)
- Provides `mutate(props)` and `restore()` methods with a `WeakMap` for originals
- Is the **single point** where material properties are set

### 2.2 Scene Graph Structure

- **6.4** adds a `measurementsGroup` to the scene
- **6.5** adds `mainGroup`, `highlightGroup`, `backgroundGroup`
- **6.2** adds a clipping plane indicator mesh

These must coexist. **Resolution:** Adopt a structured scene graph:

```
scene
├── modelContainer (6.5: mainGroup, highlightGroup, backgroundGroup; or just mesh for non-operator mode)
├── overlayContainer (6.4: measurementsGroup, 6.2: clippingIndicator)
├── helpersContainer (grid, axes)
```

### 2.3 Interaction Modes

- **6.4** introduces `viewMode = 'orbit' | 'measure-distance' | 'measure-bbox'`
- **6.2** uses `TransformControls` that disables orbit during drag
- Both must coexist: measurement mode should disable clipping manipulation, and vice versa.

**Resolution:** Single interaction mode state machine:

```ts
type InteractionMode = 'orbit' | 'measure-distance' | 'measure-bbox' | 'clip-plane' | 'annotate';
```

Only one active at a time; each mode registers its pointer/keyboard handlers.

### 2.4 Toolbar Growth

All five features add toolbar controls. Plan for a structured toolbar layout:

- **View section**: resolution (6.1), render mode
- **Tools section**: measurement (6.4), clipping (6.2), annotation (10.5)
- **Display section**: color mode (6.3), operator preview (6.5)

### 2.5 Renderer Setup

- **6.4** wants to add `CSS2DRenderer` alongside WebGL renderer.
- **6.1** changes the render resolution dynamically.
- **10.4** evaluates WebGPU.
- These are all renderer-level changes that must be coordinated.

---

## 3. AI System Prompt Modifications (3 plans)

**Plans modifying the AI system prompt:**

- 5.3 (Multi-File Context): injects project file context block
- 5.5 (Edit Size Limit): injects current limit dynamically
- 5.4 (Templates): templates may reference or modify prompt structure

**Reconciliation:**
The system prompt construction (`build_system_prompt()` in Rust / equivalent in web) must become a **composable builder** rather than a monolithic string:

```
System Prompt =
  Base instructions
  + OpenSCAD reference
  + [if multi-file] Project context block (5.3)
  + [dynamic] Edit size limit (5.5)
  + Tool descriptions (existing)
```

**Risk if not reconciled:** Each feature appends to the system prompt independently, causing ordering conflicts and potential prompt injection issues.

---

## 4. Message Format Evolution (2 plans)

**5.2 (Image Input)** introduces `ContentPart[]` format replacing `content: string`.
**5.1 (Conversation History)** persists conversations with the existing string format.

**Conflict:** If 5.1 ships first with string-format persistence, then 5.2 changes the format, 5.1 needs a migration.

**Resolution:**

- Design message format v2 (from 5.2) **before** implementing 5.1 persistence.
- 5.1 should persist using the v2 format from the start, even if images aren't supported yet (`content: [{ type: 'text', text: '...' }]`).
- Add a backward-compatible parser for legacy `content: string` in the v2 schema.

---

## 5. Dependency Ordering (Recommended Implementation Sequence)

### Tier 0: Foundation (must be done first)

1. **4B.1 — Decompose App.tsx** (unblocks everything; reduces merge conflicts)
2. **4B.3 — Centralized State Management** (establishes store patterns; unblocks 5.x)
3. **Tree-sitter `OpenScadParser` service** (unblocks all Phase 7)
4. **Built-in symbol table** (shared data for Phase 7)

### Tier 1: Core Features (can be parallelized within tier)

5. **4B.2 — Error Boundaries** (quick, independent after 4B.3)
6. **5.5 — Configurable Edit Size Limit** (small, independent)
7. **5.1 — Conversation History** (after 4B.3 for store patterns; design format v2 first)
8. **5.4 — AI Prompt Templates** (independent after 4B.3)

### Tier 2: AI Enhancements (sequential dependencies)

9. **5.2 — Image Input** (after 5.1 format v2 decision)
10. **5.3 — Multi-File Context** (after 4B.3 for store; after include/use resolution)

### Tier 3: Viewer Features (can be parallelized, but coordinate on ThreeViewer)

11. **6.1 — Adaptive Resolution** (simplest viewer change; do first)
12. **6.3 — Color Support** (MVP is small and independent)
13. **6.2 — Clipping Plane** (introduces material mutation pattern)
14. **6.4 — Measurement Tools** (introduces interaction modes)
15. **6.5 — Special Operators** (most complex viewer change; builds on 6.3 material work)

### Tier 4: Editor Intelligence (sequential; share Tree-sitter infra)

16. **7.1 — Static Linting** (establishes scope model + lint engine)
17. **7.2 — Go-to-Definition** (reuses 7.1's symbol index)
18. **7.3 — Hover Documentation** (reuses 7.1/7.2's symbol index)
19. **7.4 — Improved Autocomplete** (reuses all of above)

### Tier 5: Platform Expansion (can be parallelized)

20. **8.4 — CI/CD Completion** (do before 8.1/8.2 to validate builds)
21. **8.1 — Windows Support**
22. **8.2 — Linux Support**
23. **8.3 — Auto-Update** (after 8.1/8.2 for platform artifacts)

### Tier 6: Future Vision (independent; long-term)

24. **10.1 — Community Sharing**
25. **10.2 — Offline LLM**
26. **10.3 — Plugin System**
27. **10.4 — Performance Optimization**
28. **10.5 — Collaboration (CRDT)**

---

## 6. Potential Conflicts & Resolutions

### 6.1 State Access Pattern Conflict

**Problem:** 4B.3 centralizes state in Zustand, but useAiAgent currently uses refs for stable callbacks. Plans 5.2 and 5.3 both extend AI tool implementations.
**Resolution:** After 4B.3, all AI tool implementations should read from `editorStore.getState()` (synchronous, no stale closure issues). Plans 5.2 and 5.3 should be implemented after 4B.3 to avoid building on the old ref pattern.

### 6.2 Include/Use Resolution Duplication

**Problem:** Plans 5.3, 7.1, 7.2, and 7.4 all need include/use file resolution. 5.3 mentions "reuse existing resolution logic from v0.7.1."
**Resolution:** Extract include/use resolution into a shared service (`IncludeResolver`) that can be used by render pipeline, AI context builder, linter, and definition provider. Don't build four separate resolvers.

### 6.3 Editor Content Source Conflict

**Problem:** Multiple features want to read/write editor content:

- 4B.3's `editorStore.doc.code` (source of truth)
- 5.3's multi-file context builder (reads multiple files)
- AI tools' `apply_edit` (writes code)
- 10.5's Yjs `Y.Text` (becomes source of truth in collab mode)

**Resolution:** In non-collab mode, `editorStore.doc.code` is the single truth. In collab mode (10.5), Yjs `Y.Text` becomes truth and `editorStore` subscribes to it. The AI `apply_edit` must go through the authoritative source in both cases. Design the edit pathway as an abstraction from the start.

### 6.4 Keyboard Shortcut Conflicts

**Problem:** Multiple plans add keyboard shortcuts:

- 4B.1: ⌘K (AI), ⌘, (settings), ⌘T (new tab), ⌘W (close tab)
- 6.2: P (toggle clip), X/Y/Z (axis), arrows (nudge)
- 6.4: M (measure), B (bbox), Esc (exit), Delete
- 8.1: Ctrl remapping for Windows

**Resolution:** Implement 4B.1's `useKeyboardShortcuts` as a centralized shortcut registry that checks interaction mode before dispatching. Viewer shortcuts (6.2, 6.4) should only be active when the viewer is focused and in the appropriate mode.

### 6.5 Monaco Provider Registration Order

**Problem:** Plans 7.1-7.4 each register Monaco providers independently (markers, definition, hover, completion). If they share a symbol index, initialization order matters.
**Resolution:** Create a single `OpenScadLanguageService` that initializes the shared parser/index infrastructure and registers all providers in one place. Individual features can be toggled on/off, but initialization is coordinated.

---

## 7. Cross-Cutting Concerns

### 7.1 Web vs Desktop Parity

Features that have explicit web/desktop differences:

- 5.3 (multi-file): limited on web (no filesystem)
- 8.1/8.2 (platform support): desktop only
- 10.2 (offline LLM): desktop only
- 10.5 (collab): both, but desktop needs WebSocket connectivity

**Pattern:** Always implement the web-compatible version first, then add desktop-specific enhancements. Use `PlatformBridge` to gate capabilities.

### 7.2 Performance Budget

Multiple features add processing on every keystroke/idle:

- 7.1: linting (debounced)
- 7.2: definition index update (debounced)
- 7.3: hover index update (debounced)
- 7.4: completion index update (debounced)
- 6.3: color parsing
- 6.1: resize observer
- 10.4: render scheduling

**Mitigation:** Share one Tree-sitter parse + index build per idle cycle (not four). The `OpenScadParser` service should produce all indexes once, and features subscribe to the result.

### 7.3 Testing Infrastructure

Many plans mention Playwright E2E tests. Coordinate on:

- Shared test fixtures (`.scad` files with known properties)
- Test utility functions (open file, wait for render, check diagnostics)
- Mock services (for AI, platform bridge, file system)

---

## 8. Summary of Required Shared Infrastructure

| Component                        | Used By                        | Build Before        |
| -------------------------------- | ------------------------------ | ------------------- |
| `useEditorState` Zustand store   | 4B.2, 5.1–5.5, 7.x, 10.5       | All Phase 5+        |
| `OpenScadParser` service         | 7.1, 7.2, 7.3, 7.4, (6.3, 6.5) | All Phase 7         |
| Built-in symbol table JSON       | 7.1, 7.2, 7.3, 7.4             | All Phase 7         |
| `IncludeResolver` service        | 5.3, 7.1, 7.2, 7.4             | Phase 5.3 / Phase 7 |
| `MaterialManager` (ThreeViewer)  | 6.2, 6.3, 6.5                  | Phase 6.2+          |
| Interaction mode state machine   | 6.2, 6.4, 10.5                 | Phase 6.2+          |
| Composable system prompt builder | 5.3, 5.5                       | Phase 5.3           |
| Message format v2                | 5.1, 5.2                       | Phase 5.1           |
| `OpenScadLanguageService`        | 7.1, 7.2, 7.3, 7.4             | All Phase 7         |

---

## 9. Conclusion

The 26 plans are broadly compatible, but **six coordination points** require explicit attention before implementation begins:

1. **Tree-sitter + symbol index infrastructure** must be built once, shared by all Phase 7 features.
2. **Zustand store patterns** from 4B.3 must be established before other stores are created.
3. **ThreeViewer modifications** across Phase 6 must coordinate on material management, scene graph structure, and interaction modes.
4. **Message format v2** must be designed before 5.1 persistence to avoid migration.
5. **AI system prompt** must become composable before 5.3 and 5.5.
6. **Include/use resolution** must be extracted to a shared service before being used by 4+ features.

Following the recommended implementation sequence (Tier 0 → Tier 6) will minimize rework, avoid conflicts, and ensure that shared infrastructure is built before its consumers need it.
