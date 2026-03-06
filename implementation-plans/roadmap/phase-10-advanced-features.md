# Phase 10 — Advanced Post-1.0 Features Implementation Plan

## Overview

Two parallel tracks: (1) cloud-backed community + collaboration on Cloudflare (Workers/D1/R2/Durable Objects) and (2) local-first extensibility + performance (offline LLM, plugin runtime, render pipeline).

---

# 1) Community & Sharing

## 1.1 Share via URL

**Feasibility:** Medium | **Effort:** 2–4 weeks

### Approach: Hybrid sharing

- **Small designs**: compressed payload in URL hash (LZ-string-like → base64url)
- **All designs**: first-party paste service (Cloudflare Worker + D1/R2) returning short slug

### Implementation

1. Define share payload schema: `{v, source, settings?, camera?, title?}`
2. URL-only path: compress → `#payload=` (safe cap ~2–8 KB)
3. Paste-service path: POST to Worker → D1 metadata + optional R2 → slug URL
4. Open flow: parse URL, fetch if slug, decode if hash payload, open as new tab
5. Optional screenshot: client-side preview → upload to R2

## 1.2 Example Gallery

**Feasibility:** Easy–Medium | **Effort:** 1–2 weeks (curated) + 2–6 weeks (backend)

- Start with repo-hosted `gallery.json` + bundled examples
- Categories, search, "Open (copy)" button, preview thumbnails
- Later: migrate to D1 with submission moderation

## 1.3 Community Prompt Library

**Feasibility:** Medium (read-only) → Hard (full community) | **Effort:** 1–2 weeks (curated) → 4–8+ weeks (submit/vote/moderate)

- Parameterized templates, previewable, one-click insert
- Read-only shipped in-app + remote updates from CDN
- Later: submit/upvote endpoints, D1 storage, moderation queue

---

# 2) Offline LLM

## 2.1 Integration Approach

**Feasibility:** Medium (desktop) / Very Hard (web) | **Effort:** 3–6 weeks (desktop MVP)

- **Desktop**: llama.cpp as Tauri sidecar (local HTTP server)
- **Web**: WASM inference experimental only
- LocalProvider in AI layer routing to `http://127.0.0.1:<port>`
- Streaming bridge so local tokens appear identical to cloud

## 2.2 Model Management

**Effort:** 2–4 weeks

- Model catalog JSON: `{name, size, sha256, url, quant, context, template}`
- Download with progress + resume, store in app data `models/`
- SHA-256 verification after download
- Settings screen: curated list, disk usage, download/delete

## 2.3 Offline Toggle

**Effort:** 1–2 weeks

- Modes: Auto (cloud preferred, local fallback), Cloud only, Local only
- Non-destructive switching mid-conversation

## 2.4 Fine-tuning

**Feasibility:** Very Hard | **Effort:** 6–16+ weeks

- Start with RAG + prompt engineering (not fine-tuning)
- Build corpus (public OpenSCAD examples + gallery)
- Build evaluation harness (compile success + diff quality scoring)
- Only then: instruction tuning (LoRA) on base model → GGUF export

## 2.5 Performance

- Default to small quantized GGUF model
- Benchmark after install: tokens/sec check
- Low-memory mode: smaller KV cache, smaller context

---

# 3) Plugin System

## 3.1 Plugin API Design

**Feasibility:** Hard | **Effort:** 6–12 weeks

- JS/WASM plugin runtime in sandboxed worker/iframe
- Typed message RPC protocol for plugin↔host
- v1 extension points: `tool`, `exporter`, `panel`, `theme`

## 3.2 Manifest Format

**Effort:** 1–2 weeks

```json
{
  "id": "my-plugin",
  "name": "My Plugin",
  "version": "1.0.0",
  "main": "index.js",
  "permissions": ["code:read", "code:write", "render"],
  "minAppVersion": "1.0.0"
}
```

## 3.3 Loader

**Effort:** 3–6 weeks

- Plugin installation: zip or directory with manifest + bundled JS/WASM
- Isolated runtime with narrow RPC surface
- Lifecycle hooks: `onActivate`, `onDeactivate`, `onDocumentOpen`, `onRenderComplete`
- Error boundaries + timeouts; kill on repeated failures

## 3.4 Security

**Effort:** 2–4 weeks + ongoing

- Permission checks in host RPC handlers
- Default-deny network and filesystem
- Desktop filesystem: only user-chosen paths via capability tokens
- "Safe mode" launch (disable all plugins)

## 3.5 Community Registry

**Effort:** 3–6 weeks

- Start with static JSON index on CDN (metadata + download URLs + sha256)
- In-app install + update checks
- Later: Worker + D1 registry with publisher accounts

---

# 4) Performance

## 4.1 Incremental Rendering

**Feasibility:** Very Hard | **Effort:** 8–20+ weeks (uncertain payoff)

**Pragmatic alternative:**

- Render debouncing + "render on idle"
- Geometry caching by source hash + render settings
- "Fast preview mode": lower `$fn`, skip expensive modules

## 4.2 Background Render Thread Pool

**Feasibility:** Medium | **Effort:** 2–4 weeks

- Render job queue with priorities: `interactive`, `thumbnail`, `export`
- Bounded worker pool (2–4, adaptive by device memory)
- Backpressure: cancel stale interactive jobs on new edits

## 4.3 GPU Acceleration (WebGPU)

**Feasibility:** Medium | **Effort:** 2–5 weeks

- WebGPU for Three.js preview rendering (not CSG evaluation)
- Auto-select best renderer; keep WebGL fallback
- Validate feature parity: materials, edges, transparency

## 4.4 Progress Indicator

**Feasibility:** Easy–Medium | **Effort:** 1–2 weeks

- After 500ms: spinner; after 5s: "Still working..." with cancel
- Instrument render lifecycle with stage events + timestamps
- Store rolling render durations per file for ETA ranges

---

# 5) Collaboration

## 5.1 CRDT/Yjs Integration

**Feasibility:** Hard | **Effort:** 6–12 weeks

- Yjs for document text + awareness layer (cursors, selections)
- `CollabDocument` abstraction: local string vs Yjs text
- Editor binds to Yjs via adapter; Tree-sitter parses local snapshots
- Opt-in per document/session

## 5.2 Server Requirements

**Feasibility:** Medium–Hard | **Effort:** 4–8 weeks

- Cloudflare Durable Objects for WebSocket rooms
- D1 for metadata (rooms, permissions)
- R2 for periodic snapshots
- Room creation with capability tokens; invite links with view-only vs edit

## 5.3 Conflict Resolution

**Effort:** 2–4 weeks (on top of 5.1)

- Yjs UndoManager per client (undo my actions, not global)
- Document version snapshots as safety net
- Undo granularity: group typing bursts

## 5.4 Model Annotations

**Feasibility:** Hard | **Effort:** 4–8 weeks

- Anchor to mesh space: triangle index + barycentric coordinates + world position
- Store in shared Yjs map or backend
- On re-render: attempt rebind (same meshId + faceIndex; fallback nearest point search)
- "Re-attach annotation" UX when confidence is low

---

# Effort Summary (1–2 engineers)

| Feature                                                   | Estimated Effort |
| --------------------------------------------------------- | ---------------- |
| Community & Sharing (hybrid share + gallery + prompts v1) | 4–10 weeks       |
| Offline LLM (desktop MVP + model mgmt + toggle)           | 6–12 weeks       |
| Plugin System (safe runtime + manifest + registry v1)     | 10–18 weeks      |
| Performance (worker pool + progress + caching + WebGPU)   | 5–11 weeks       |
| Collaboration (Yjs + DO server + annotations beta)        | 14–28 weeks      |
