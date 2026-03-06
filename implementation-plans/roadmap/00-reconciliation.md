# Implementation Plans — Engineering Reconciliation

> Cross-check of all 13 implementation plans for compatibility, conflicts, and dependency ordering.

---

## 1) Executive Summary

The 13 plans are broadly compatible, but several "naming/ownership" assumptions diverge: store taxonomy (4B.1 vs 4B.3), shared parsing/file-resolution (5.3 vs 7 vs 6.5), and "frontend source of truth" vs Rust-hosted AI tools (4B.3 vs current `ai_agent.rs`, plus 5.3/5.4). If you align those three foundations first, the remaining phases compose cleanly (error boundaries, conversation history, image parts, 3MF rendering, editor intelligence). The biggest risk is accidentally building two parallel resolvers/parsers and two competing state models.

---

## 2) Critical Conflicts (must resolve before implementation)

### C1 — Zustand store naming + ownership mismatch

**Plans**: 4B.1 vs 4B.3

**Incompatibility**: 4B.1 introduces `documentStore/tabStore/uiStore/notificationStore` while 4B.3 proposes `editorStore/tabsStore/renderStore/aiStore/uiStore/fileStore/settingsStore`. If you implement both literally, you'll duplicate concerns (documents vs files vs editor models vs tabs), and error-boundary "state outside panels" becomes ambiguous ("which store owns what?").

**Recommended resolution** (pick one naming scheme; make 4B.1 conform):

- Adopt **4B.3's store set as canonical** (it's the superset and already accounts for AI/render).
- Map 4B.1 concepts onto 4B.3 explicitly:
  - `documentStore` ⇒ split into **`fileStore` (persistence, paths, dirty flags, project graph)** + **`editorStore` (Monaco models, selection, cursor, language features)**.
  - `tabStore` ⇒ **`tabsStore`** (plural; include dockview layout + active tab + tab→document binding).
  - `notificationStore` ⇒ either **a slice inside `uiStore`** (simplest) or keep as a separate store only if you truly need independent lifecycles; don't create both.
- Keep 4B.1's principle "documents are data; tabs are view" but implement it as **fileStore vs tabsStore**, not as a new store set.

---

### C2 — "Frontend source of truth" vs Rust-based AI tool execution

**Plans**: 4B.3 (eliminate Rust `EditorState`) vs current architecture in AGENTS.md (`ai_agent.rs` tools rely on backend-held editor buffer), plus 5.3 (`explore_project`, cross-file edits) and 5.4 (edit-limit enforcement in Rust).

**Incompatibility**: If Rust stops owning editor state, tools like `get_current_code` / `apply_edit` can't safely operate unless they can synchronously access the canonical buffer + multi-file contents. Also, 5.3's filesystem-bounded exploration is naturally backend/platform-dependent, while 4B.3 pushes logic to frontend stores.

**Recommended resolution** (minimal-change, keeps existing Rust agent):

- Define a strict contract: **Frontend stores are canonical for UI state and document content; Rust holds only an ephemeral "tool cache"** required to execute AI tools.
- Implement **one synchronization path** (choose one):
  - **Option A (simplest operationally):** frontend pushes active document text (and optionally open documents) to backend on debounce / on save / on AI query start; backend uses this for `get_current_code`/`apply_edit`. This removes "Rust as truth" while keeping tools synchronous.
  - **Option B (more complex):** backend requests content via event+reply (correlation IDs) each time a tool runs.
- For 5.3: keep `explore_project` and `read_file`-like abilities behind **`PlatformBridge` services** (desktop uses Rust FS sandbox; web uses virtual/project FS), but the AI agent can still live in Rust on desktop while web uses a separate execution path (see parity section).
- For 5.4: enforce the edit-line-limit in **both places**: frontend setting is canonical; backend validates using that setting value (passed with the tool call or stored in backend settings mirror).

---

### C3 — Duplicated parsing + file resolution across AI context, special operators, and editor intelligence

**Plans**: 5.3 (use/include parsing + resolver), 6.5 (Tree-sitter detection of `# % * !` operators), Phase 7 (`editor-intel/` with `fileResolver`, `astCache`, indexer), plus "Tree-sitter already used for formatting/customizer".

**Incompatibility**: If 5.3 ships a regex-based include parser and Phase 7 ships a Tree-sitter resolver/indexer later, you'll have two competing graphs, two path-sandbox policies, and inconsistent results (AI context ≠ go-to-def ≠ special-operator transform).

**Recommended resolution**:

- Create **one shared "OpenSCAD Project/Parse Core"** API (in `packages/shared/` unless there's a hard reason not to) that provides:
  - `parseIncludes(source) → IncludeEdges` (comment/string aware)
  - `detectSpecialOperators(ast|tokens) → ranges`
  - `FileResolver` interface (logical→absolute/virtual, sandbox rules, cycle detection)
  - `AstCache` keyed by (filePath, version/hash)
- Phase 5.3 uses it for AI context; 6.5 uses it for operator transforms; Phase 7 uses it for indexing/lint/providers. UI-only adapters (Monaco, dockview) stay in app code.

---

### C4 — Message schema migration affects persistence, streaming, UI, and vision gating

**Plans**: 5.2 (MessageContentPart[]), 5.1 (conversation history + versioned schema), 4B.3 (`aiStore`), plus existing streaming/tool-call rendering.

**Incompatibility**: If 5.1 lands first storing `{content: string}`, then 5.2 changes the in-memory model, you'll need immediate migrations + dual rendering paths; if 5.2 lands first without versioned persistence, history breaks.

**Recommended resolution**:

- Introduce a **versioned message envelope** first (even if only "text parts" initially):
  - v1: `{ role, content: string }`
  - v2: `{ role, content: MessageContentPart[] }`
- Update `aiStore` to internally normalize to **v2** (text becomes `[{type:"text", text}]`) while keeping a backward-compatible loader for v1 in conversation history.
- Only after v2 is the internal norm: add image inputs + model capability gating.

---

### C5 — 3MF + group traversal + clipping planes + cache keys

**Plans**: 6.3 (3MF when color), 6.5 (special operators + 3MF export), 6.2 (section plane clipping), 6.1 (viewport-based cache keys).

**Incompatibility**:

- Three.js clipping planes are effectively **material-level**; a 3MF load yields many meshes/materials, so a "single mesh" pipeline will miss clipping on some submeshes.
- Cache keys that only consider `codeHash:WxH:settingsHash` may collide across **STL vs 3MF**, "special-operator preview transform on/off", and loader pipeline changes.

**Recommended resolution**:

- Standardize a render "artifact contract": `{format: "stl"|"3mf", scene: THREE.Group, materials: Material[]}` and always traverse `Group` to apply clipping/stencil settings per mesh/material.
- Expand cache key to include at least: `format`, `pipelineVersion`, and `transformMode` (normal vs special-operator-preview), in addition to resolution/DPR/settings.

---

## 3) Moderate Issues (should resolve, but workarounds exist)

### M1 — Error boundaries depend on stores, but you can stage them

**Plans**: 4B.2 vs 4B.3

**Mismatch**: 4B.2 assumes panel state is external; 4B.3 provides that, but you may want earlier resilience.

**Resolution**: Implement 4B.2 in the proposed order **only for panels whose state is already store-backed**; for Editor/Preview, wait until `editorStore/renderStore` hold the needed recovery state.

### M2 — Notification/AppError consistency across refactors

**Plans**: 4B.1 (`AppError`, `notificationStore`), 4B.3 (`uiStore`), 4B.2 (error boundary UX)

**Mismatch**: Multiple potential error channels (throw boundaries, toast store, console panel).

**Resolution**: Single error shape (`AppError`) and single dispatch path (`uiStore.pushToast(...)` or `notificationStore.notify(...)`), and boundaries should report into that (don't invent panel-specific toasts).

### M3 — Cross-store orchestration can become a hidden god-module

**Plans**: 4B.3 "thin orchestrators", 4B.1 extracted hooks, 5.x AI flows (cancel→save→load)

**Mismatch**: Without strict boundaries, orchestrators become the new App.tsx.

**Resolution**: Make orchestrators **feature-scoped** (e.g., `conversationOrchestrator`, `renderOrchestrator`) and keep their public APIs small.

---

## 4) Minor Alignment Items (nice-to-have consistency fixes)

- **Naming**: choose `tabsStore` vs `tabStore` (recommend plural, matches collections). Keep `settingsStore` as-is.
- **Schema**: conversation summaries (5.1) should store a `schemaVersion` and a `messageFormatVersion` separately (so summaries don't churn with message parts).
- **PlatformBridge rule enforcement**: add an ESLint boundary rule to back "No `@tauri-apps/*` imports outside platform/…" (4B.4) so it stays true over time.

---

## 5) Recommended Implementation Order (dependency graph)

```
 ┌─────────────────────────────────────────────────────────────────────┐
 │  PHASE 1: Foundations                                              │
 │                                                                     │
 │  4B.4 Platform Abstraction ──┐                                      │
 │                               ├─► 4B.3 Store Foundation ───────┐    │
 │  (lock interface, add         │   (canonical taxonomy +         │    │
 │   missing services)           │    ownership)                   │    │
 └───────────────────────────────┘                                 │    │
                                                                   ▼    │
 ┌─────────────────────────────────────────────────────────────────────┐
 │  PHASE 2: App.tsx Refactor                                         │
 │                                                                     │
 │  4B.1 Decompose App.tsx ──► 4B.2 Error Boundaries                  │
 │  (rewritten to use              (staged: Console/Diff first,        │
 │   canonical stores)              Editor/Preview after stores stable) │
 └─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
 ┌─────────────────────────────────────────────────────────────────────┐
 │  PHASE 3: AI Message Infrastructure                                │
 │                                                                     │
 │  5.2 MessageContentPart ──► 5.1 Conversation History               │
 │  (internal v2 normalization,    (persistence with schema            │
 │   text-only first)               versioning + v1/v2 compat)        │
 │                                                                     │
 │  5.4/5.5 Edit Limit + Templates (can parallel with 5.1)            │
 └─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
 ┌─────────────────────────────────────────────────────────────────────┐
 │  PHASE 4: Shared Parse/Resolve Core (enables 5.3 + 6.5 + 7)       │
 │                                                                     │
 │  OpenSCAD Project Core:                                             │
 │  - parseIncludes()                                                  │
 │  - detectSpecialOperators()                                         │
 │  - FileResolver interface                                           │
 │  - AstCache                                                         │
 └─────────────────────────────────────────────────────────────────────┘
                    │                    │                    │
                    ▼                    ▼                    ▼
 ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────────┐
 │ 5.3 Multi-File   │  │ 6.1/6.2 Preview  │  │ 7 Editor             │
 │ AI Context       │  │ Resolution +     │  │ Intelligence         │
 │ + cross-file     │  │ Section Plane    │  │ (lint, go-to-def,    │
 │ edits            │  │                  │  │  hover, autocomplete)│
 └──────────────────┘  └──────────────────┘  └──────────────────────┘
                              │
                              ▼
                    ┌──────────────────┐
                    │ 6.3/6.5 3MF     │
                    │ Pipeline +      │
                    │ Color + Special │
                    │ Operators       │
                    └──────────────────┘
                              │
                              ▼
 ┌─────────────────────────────────────────────────────────────────────┐
 │  PHASE 5: Distribution                                             │
 │                                                                     │
 │  8 Cross-Platform + CI/CD + E2E                                    │
 │  (after path/FS authority and PlatformBridge proven by 5.3/7)      │
 └─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
 ┌─────────────────────────────────────────────────────────────────────┐
 │  PHASE 6: Post-1.0                                                 │
 │                                                                     │
 │  10 Advanced Features (community, offline LLM, plugins, collab)    │
 └─────────────────────────────────────────────────────────────────────┘
```

### Parallelism opportunities

| Can run in parallel               | Constraint                             |
| --------------------------------- | -------------------------------------- |
| 5.3 + 6.1/6.2 + 7                 | All depend on shared parse core only   |
| 5.4/5.5 + 5.1                     | Independent after message schema lands |
| 6.3/6.5 + 7                       | 6.3/6.5 depends on 6.1/6.2; 7 does not |
| 4B.2 (Console/Diff panels) + 4B.1 | Console/Diff don't need store refactor |

### Hard dependencies (MUST precede)

| Prerequisite         | Enables                               |
| -------------------- | ------------------------------------- |
| 4B.3 (stores)        | 4B.1, 4B.2 (Editor/Preview), 5.x, 6.x |
| 4B.4 (platform)      | 4B.3 (interface completeness)         |
| 5.2 (message schema) | 5.1 (history), 5.2 image UI           |
| Shared parse core    | 5.3, 6.5, 7                           |
| 6.1/6.2 (pipeline)   | 6.3/6.5 (3MF + operators)             |
| 5.3 + 7 (proven FS)  | 8 (cross-platform distribution)       |

---

## 6) Shared Infrastructure Recommendations

These are things multiple plans need — build them as shared modules to avoid duplication:

### 6a. Canonical stores + types

- One `AppError` shape with `scope`, `message`, `cause`, `recoverable`
- One `DocumentId`/`FileId` concept (not two competing identity systems)
- One "tab binds to file" mapping (in `tabsStore`)
- One notification dispatch path (`uiStore.pushToast(...)`)

### 6b. OpenSCAD parse/resolve core (shared)

- Include graph parser (comment/string-aware)
- Cycle detection + path sandbox policy
- AST cache (keyed by filePath + version/hash)
- Special operator detection
- Reused by: 5.3 (AI context), 6.5 (operator transforms), 7 (editor intelligence)

### 6c. Render pipeline contract

- Single scene representation: always `THREE.Group` traversal (not single mesh assumption)
- Unified cache key schema: `codeHash:format:WxH:settingsHash:pipelineVersion:transformMode`
- One place to apply section-plane clipping + stencil across all meshes/materials

### 6d. AI message model + persistence versioning

- Internal v2 normalization (`MessageContentPart[]`)
- Backward-compatible loader for v1 (`{content: string}`)
- Capability gating for vision models in one place (`aiStore` or AI domain module)

---

## 7) Web vs Desktop Feature Parity

### Desktop-only features

| Feature                   | Why desktop-only       | Web fallback               |
| ------------------------- | ---------------------- | -------------------------- |
| Native file dialogs       | OS integration         | Browser file picker        |
| Native menus              | Tauri menu API         | Custom menu bar            |
| Auto-update (8.3)         | Tauri updater plugin   | N/A (always latest deploy) |
| `explore_project` full FS | Real filesystem access | VFS/mounted files only     |
| Offline LLM (10)          | llama.cpp sidecar      | Experimental WASM only     |

### PlatformBridge additions needed

| New service/method              | Used by | Desktop impl        | Web impl             |
| ------------------------------- | ------- | ------------------- | -------------------- |
| `ConversationService`           | 5.1     | Tauri commands      | localStorage         |
| `FileResolver` (project-aware)  | 5.3, 7  | Rust FS + sandbox   | VFS adapters         |
| `getPreviewImage()`             | 5.2     | Canvas capture      | Canvas capture       |
| `PathService` (normalize, join) | 8       | Rust path authority | POSIX-like normalize |

---

_Generated from Oracle reconciliation analysis of all 13 implementation plans._
