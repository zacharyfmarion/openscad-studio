# AGENTS.md - AI Agent Architecture

This document describes the AI system that is currently implemented in OpenSCAD Studio.

## Overview

OpenSCAD Studio runs the AI copilot entirely on the client side.

- The same React/TypeScript AI stack is used in both the standalone web app and the Tauri desktop app.
- Model requests are still made directly from the frontend with the Vercel AI SDK.
- Tauri provides desktop shell features such as native file dialogs, filesystem access, native rendering, and a desktop-only localhost MCP bridge for external agents.
- OpenSCAD rendering is client-side: web uses `openscad-wasm` in a Web Worker, while the desktop app uses a bundled native OpenSCAD binary invoked via Tauri IPC commands.

The top-level `README.md` is user-facing. Keep it focused on product-level information and avoid turning it into an engineering index; architecture, roadmap, analytics, and implementation details should live in assistant/developer docs instead.

## Design Context

### Users

OpenSCAD Studio should optimize first for hobbyist makers. These users are building precise 2D and 3D models for fabrication, prototyping, printing, laser cutting, and personal projects. They value tools that help them move quickly without feeling simplified or toy-like, and they want an environment that supports experimentation while still feeling trustworthy for exact work.

### Brand Personality

The brand personality is build, speed, precision. The product should feel professional, technically credible, and efficient. It should support focused making work with confidence and clarity rather than leaning on playful novelty or overt AI-first theatrics.

### Aesthetic Direction

Preserve and tighten the current aesthetic instead of replacing it. The existing theme system is a strength and should remain intact, with Solarized Dark continuing as the default baseline unless intentionally changed elsewhere. The visual direction should take cues from tools like Ableton Live and Affinity Designer: dense but deliberate, polished, capable, and tuned for serious creative work. Avoid anything that feels generic, glossy, or obviously AI-generated.

### Design Principles

1. Respect maker workflows. Prioritize fast iteration, precise feedback, and layouts that help users stay in flow while modeling.
2. Tighten, do not reinvent. Improve hierarchy, spacing, contrast, and polish within the current design language instead of introducing a disconnected visual reset.
3. Feel professionally technical. Interfaces should communicate capability and precision without becoming cold, cluttered, or intimidating.
4. Preserve theme flexibility. New UI work must fit naturally into the existing theme system and work well in both dark and light themes.
5. Avoid AI-generic styling. Favor intentional, grounded, tool-like design over flashy gradients, empty decoration, or trendy "generated" aesthetics.

## Current Architecture

```
┌─────────────────────────────────────────────────────────────┐
│ React Frontend (shared by Web + Tauri desktop)             │
│ ├── WelcomeScreen.tsx      (welcome composer)              │
│ ├── AiPromptPanel.tsx      (chat transcript + composer)    │
│ ├── AiComposer.tsx         (shared text/image input)       │
│ ├── useAiAgent.ts          (AI state, streaming, drafts)   │
│ ├── aiService.ts           (model + tool definitions)      │
│ └── useOpenScad.ts         (rendering + diagnostics)       │
└─────────────────────────────────────────────────────────────┘
                 │
                 │ HTTPS from the client
                 ▼
        ┌───────────────────┐
        │ Anthropic API     │
        └───────────────────┘
                 │
                 ▼
        ┌───────────────────┐
        │ OpenAI API        │
        └───────────────────┘

Desktop-only shell services:
┌─────────────────────────────────────────────────────────────┐
│ Tauri / Rust                                                │
│ ├── native menus                                            │
│ ├── file open/save/export commands                          │
│ ├── native OpenSCAD binary rendering (render.rs)            │
│ ├── localhost MCP server for external agents (mcp.rs)       │
│ ├── working-directory/history helpers                       │
│ └── desktop packaging/runtime                               │
└─────────────────────────────────────────────────────────────┘
```

## Security Model

### API keys

AI API keys are currently stored client-side in obfuscated localStorage-backed state, including when the app runs inside the Tauri webview.

- This is a convenience tradeoff for a shared web + desktop AI implementation.
- It is not equivalent to backend-only secret storage.
- The current architecture intentionally prioritizes one shared AI stack across web and desktop over secret isolation.

Relevant code:

- `apps/ui/src/stores/apiKeyStore.ts`
- `apps/ui/src/hooks/useAiAgent.ts`
- `apps/ui/src/services/aiService.ts`

### Editing model

The AI editing flow is still diff-based and validated client-side:

1. The model reads the current OpenSCAD code through tools.
2. The model proposes exact-string edits through `apply_edit`.
3. The edit is validated in TypeScript.
4. OpenSCAD syntax is checked before the change is accepted.
5. The editor and preview update locally.

Relevant code:

- `apps/ui/src/services/aiService.ts`
- `apps/ui/src/hooks/useAiAgent.ts`
- `apps/ui/src/services/renderService.ts`

## Communication Flow

### Chat flow

1. The user types a prompt or attaches images in the shared composer.
2. `useAiAgent.ts` converts chat messages into Vercel AI SDK message parts.
3. `streamText()` sends the request directly to the selected provider.
4. Streaming text and tool calls update the transcript in real time.
5. Tool execution happens locally in the frontend.

The in-app copilot still has no Rust-side model transport or backend conversation loop. Desktop builds now also expose a localhost MCP server from Tauri for external-agent workflows, with requests bridged into the active workspace window.

### Provider selection

- The current model is stored in local storage.
- The provider is inferred from the selected model id.
- Available models are fetched from provider APIs on the client when keys exist.

Relevant code:

- `apps/ui/src/hooks/useModels.ts`
- `apps/ui/src/components/ModelSelector.tsx`
- `apps/ui/src/stores/apiKeyStore.ts`

## Tool Definitions

The client-side AI agent currently exposes these tools through `aiService.ts`:

- `get_project_context`
- `list_folder_contents`
- `read_file`
- `get_preview_screenshot`
- `apply_edit`
- `create_file`
- `set_render_target`
- `get_diagnostics`
- `trigger_render`
- `set_measurement_unit`

All tool execution is implemented in TypeScript and runs inside the app frontend.

## Desktop vs Web

### Shared

- React UI
- AI chat/composer state
- Vercel AI SDK provider calls
- diagnostics parsing
- image attachment preprocessing

### Tauri-only

- native file dialogs
- full filesystem reads/writes
- native menus
- desktop packaging/runtime
- native OpenSCAD binary rendering
- localhost MCP endpoint for external agents
- multi-file project directory management
- library path resolution

### Web-only constraints

- browser file APIs are limited compared to desktop
- SharedArrayBuffer requires COOP/COEP headers
- local storage and File System Access API behavior depends on browser support
- rendering via openscad-wasm (no native binary)
- no persistent project directories (files are in-memory)

## Parallel agents

Multiple AI agents may be working on this repository simultaneously. If you encounter unexpected changes, new files, or errors that you did not introduce, ignore them and move on. Do not attempt to delete, revert, or fix changes made by other agents unless the user explicitly asks you to work in that area.

## Pull requests

Unless the user explicitly says otherwise, open pull requests against `main`. Do not target release branches or any other base branch by default.

For end-to-end implementation requests such as `/create <prompt>` or "take this from plan to PR", use the repo-local `create-feature` skill under `.agents/skills/create-feature/`. That workflow should own the implementation plan, choose tests based on the changed behavior, run deterministic local validation through `scripts/validate-changes.sh`, open a draft PR against `main`, and return the PR preview URL when one applies.

## Implementation plans

When starting a non-trivial feature or change, create a Markdown plan file in `implementation-plans/` (for example, `implementation-plans/ai-edit-validation.md`). The plan should outline the goal, approach, affected files, and a checklist of steps.

As you work, mark off progress in the plan file using `- [x]` checkboxes. The plan file serves as a durable, human-readable record of what was done and what remains, and it persists across sessions in a way ephemeral agent state does not.

The `create-feature` skill follows the same rule: for non-trivial work it must create and maintain an implementation plan before or alongside code changes, then keep the checklist updated as steps complete.

Do not create an implementation plan for small maintenance-only tasks. Straightforward fixes such as formatting cleanup, lint cleanup, CI-only breakage fixes, typo/docs-only edits, or other narrow housekeeping changes should be done without adding a new file under `implementation-plans/`.

## Current Status

This document is intentionally scoped to the architecture that exists today:

- AI is client-side
- keys are client-side
- Tauri is not an AI backend
- web and desktop share one AI implementation

If the project later moves AI transport or key handling into Rust/Tauri, this document should be updated again at that time.
