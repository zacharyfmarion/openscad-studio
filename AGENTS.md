# AGENTS.md - AI Agent Architecture

This document describes the AI agent system architecture in OpenSCAD Studio, including the sidecar process, tool definitions, security model, and communication protocols.

## Overview

OpenSCAD Studio uses a **secure sidecar architecture** for AI integration, with the following goals:

1. **Security**: API keys never touch the renderer process
2. **Sandboxing**: AI editing is diff-based with validation and test compilation
3. **Transparency**: All tool calls are visible to the user
4. **Rollback**: Failed edits are automatically reverted

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│  React Frontend (Renderer Process)                          │
│  ├── AiPromptPanel.tsx   (User input, streaming display)    │
│  ├── useAiAgent.ts       (State management, IPC wrapper)    │
│  └── DiffViewer.tsx      (Diff visualization, accept/reject)│
└────────────────┬────────────────────────────────────────────┘
                 │ Tauri IPC (invoke/listen)
                 ▼
┌─────────────────────────────────────────────────────────────┐
│  Rust Backend (Main Process)                                │
│  ├── cmd/conversations.rs   (query_agent, cancel_stream)    │
│  ├── cmd/ai.rs              (Keychain API key storage)      │
│  ├── cmd/ai_tools.rs        (Tool implementations)          │
│  │   ├── apply_edit         (Diff validation & apply)       │
│  │   ├── get_current_code   (Return editor buffer)          │
│  │   ├── get_diagnostics    (Return OpenSCAD errors)        │
│  │   ├── get_preview_screenshot (Return file:// path)       │
│  │   └── trigger_render     (Manual render trigger)         │
│  └── agent_sidecar.rs       (Sidecar lifecycle manager)     │
└────────────────┬────────────────────────────────────────────┘
                 │ JSON-RPC over stdio
                 ▼
┌─────────────────────────────────────────────────────────────┐
│  Node.js Sidecar Process                                    │
│  └── agent-server.ts                                        │
│      ├── Tools definition    (Zod schemas)                  │
│      ├── System prompt       (OpenSCAD context)             │
│      ├── callRust()          (JSON-RPC client)              │
│      └── runAgentQuery()     (Vercel AI SDK streaming)      │
└────────────────┬────────────────────────────────────────────┘
                 │ HTTPS
                 ▼
        ┌───────────────────┐
        │  Anthropic API    │
        │  (Claude 4.5)     │
        └───────────────────┘
```

## Security Model

### API Key Storage

**Problem**: API keys must never be accessible to the renderer process (untrusted code).

**Solution**: Three-layer protection:
1. **OS Keychain**: Keys stored via `keyring` crate (macOS Keychain, Windows Credential Manager, Linux Secret Service)
2. **Environment Injection**: Retrieved by Rust backend and injected to sidecar via environment variables on spawn
3. **Sidecar Isolation**: Node.js sidecar reads `process.env.ANTHROPIC_API_KEY`, never exposes to frontend

**Code References**:
- Keychain operations: `apps/ui/src-tauri/src/cmd/ai.rs` (store_api_key, get_api_key, clear_api_key)
- Sidecar spawn: `apps/ui/src-tauri/src/agent_sidecar.rs:spawn()` - injects env vars
- Sidecar reads: `apps/sidecar/src/agent-server.ts:getModelProvider()`

### Diff-based Editing

**Problem**: AI models can hallucinate or generate unsafe code.

**Solution**: All edits use exact string replacement with validation:
1. **Exact match**: `old_string` must exist exactly once in the file
2. **Size limit**: Maximum 120 lines changed per edit
3. **Test compilation**: OpenSCAD renders the code to check for errors before accepting
4. **Automatic rollback**: If new errors are introduced, revert to previous state
5. **User confirmation**: (Future) Show diff preview before applying

**Code References**:
- Diff validation: `apps/ui/src-tauri/src/cmd/ai_tools.rs:handle_apply_edit()`
- Tool definition: `apps/sidecar/src/agent-server.ts:tools.apply_edit`

## Communication Protocol

### Frontend → Backend (Tauri IPC)

**Command**: `query_agent`

```typescript
interface QueryRequest {
  messages: Array<{
    role: 'user' | 'assistant';
    content: string;
  }>;
  mode?: 'generate' | 'edit' | 'fix' | 'explain';
}
```

**Events** (Backend → Frontend):
- `agent-stream-text`: Streaming text deltas from AI
- `agent-tool-call`: Tool invocation started
- `agent-tool-result`: Tool invocation completed
- `agent-error`: Error occurred
- `agent-done`: Stream completed

**Code References**:
- Frontend hook: `apps/ui/src/hooks/useAiAgent.ts:submitPrompt()`
- Backend handler: `apps/ui/src-tauri/src/cmd/conversations.rs:query_agent()`

### Backend → Sidecar (JSON-RPC over stdio)

**Request Format** (Backend → Sidecar):

```json
{
  "type": "query",
  "messages": [
    { "role": "user", "content": "Create a cube" }
  ]
}
```

**Response Format** (Sidecar → Backend):

```json
// Text delta
{ "type": "text", "content": "I'll create..." }

// Tool call
{ "type": "tool-call", "toolName": "apply_edit", "args": {...} }

// Tool result
{ "type": "tool-result", "toolName": "apply_edit", "result": "✅ Success" }

// Error
{ "type": "error", "error": "API key missing" }

// Done
{ "type": "done" }
```

**RPC Call Format** (Sidecar → Backend):

When the sidecar needs to call a Rust tool handler:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "get_current_code",
  "params": {}
}
```

**RPC Response Format** (Backend → Sidecar):

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": "cube([10, 10, 10]);"
}
```

**Code References**:
- Sidecar JSON-RPC client: `apps/sidecar/src/agent-server.ts:callRust()`
- Backend RPC handler: `apps/ui/src-tauri/src/agent_sidecar.rs:handle_rpc_request()`

## Tool Definitions

### 1. `get_current_code`

**Purpose**: Retrieve the current editor buffer contents

**Parameters**: None

**Returns**: String (OpenSCAD code)

**Implementation**:
- Reads from `EditorState` global state
- Returns full file contents

**Code**: `apps/ui/src-tauri/src/cmd/ai_tools.rs:handle_get_current_code()`

### 2. `get_preview_screenshot`

**Purpose**: Get file path to the current rendered preview (PNG/SVG/STL)

**Parameters**: None

**Returns**: String (file:// path)

**Use Case**: AI can "see" the rendered output to understand what the design looks like

**Implementation**:
- Returns path from last successful render
- AI SDK can access the file via file system

**Code**: `apps/ui/src-tauri/src/cmd/ai_tools.rs:handle_get_preview_screenshot()`

### 3. `apply_edit`

**Purpose**: Apply exact string replacement to the code

**Parameters**:
- `old_string`: Exact text to find (must be unique)
- `new_string`: Replacement text
- `rationale`: Human-readable explanation

**Returns**: Success/failure message with diagnostics

**Validation Steps**:
1. Check `old_string` exists exactly once
2. Count lines changed (≤ 120)
3. Apply replacement to buffer
4. Test compile with OpenSCAD
5. Compare diagnostics (new errors → rollback)
6. If success, update editor state and trigger render

**Code**: `apps/ui/src-tauri/src/cmd/ai_tools.rs:handle_apply_edit()`

### 4. `get_diagnostics`

**Purpose**: Retrieve current OpenSCAD errors and warnings

**Parameters**: None

**Returns**: Array of diagnostics with line, column, severity, message

**Use Case**: AI can see what's broken and propose fixes

**Code**: `apps/ui/src-tauri/src/cmd/ai_tools.rs:handle_get_diagnostics()`

### 5. `trigger_render`

**Purpose**: Manually trigger a preview render

**Parameters**: None

**Returns**: Success message

**Use Case**: Force render after edits (though auto-render usually handles this)

**Implementation**:
- Emits `render-requested` Tauri event
- Frontend listens and calls `manualRender()`

**Code**:
- Tool handler: `apps/ui/src-tauri/src/cmd/ai_tools.rs:handle_trigger_render()`
- Event listener: `apps/ui/src/App.tsx` (useEffect with `listen('render-requested')`)

## System Prompt

The AI agent uses a specialized system prompt with:
- Role definition (OpenSCAD expert assistant)
- Tool descriptions and usage guidelines
- Critical rules for editing (exact string matching, max 120 lines)
- OpenSCAD quick reference (primitives, transformations, boolean ops)
- Recommended workflow (get code → check diagnostics → apply edit)

**Location**: `apps/sidecar/src/agent-server.ts:buildOpenScadSystemPrompt()`

**Key Guidelines**:
- "ALWAYS use exact string replacement, never output full file replacements"
- "Provide exact substrings including whitespace and indentation"
- "Include context to make old_string unique"
- "apply_edit validates and test-compiles before applying"

## Sidecar Lifecycle

### Spawning

1. User initiates AI query from frontend
2. Rust backend checks if sidecar is already running
3. If not, spawns Node.js process:
   ```bash
   node apps/sidecar/dist/agent-server.js
   ```
4. Injects `ANTHROPIC_API_KEY` from keychain into environment
5. Waits for "Ready for agent queries" message on stderr

**Code**: `apps/ui/src-tauri/src/agent_sidecar.rs:AgentSidecar::spawn()`

### Communication

- **stdin**: Rust writes JSON-RPC requests and query messages
- **stdout**: Sidecar writes stream responses (text/tool-call/tool-result/done)
- **stderr**: Logs (captured by Rust for debugging)

### Shutdown

1. User closes app or stops agent
2. Rust sends `SIGTERM` to sidecar process
3. Sidecar cleans up and exits
4. Rust waits for child process to terminate

**Code**: `apps/ui/src-tauri/src/agent_sidecar.rs:AgentSidecar::shutdown()`

## Error Handling

### Frontend Errors
- Network failures: Display error banner in UI
- Streaming interruption: Allow retry
- Tool call failures: Show in conversation history

**Code**: `apps/ui/src/hooks/useAiAgent.ts:error` state

### Backend Errors
- Sidecar spawn failure: Return error to frontend, suggest checking API key
- RPC timeout: Kill sidecar and restart
- Tool handler errors: Return error message to sidecar, AI can retry

**Code**: `apps/ui/src-tauri/src/cmd/conversations.rs:query_agent()` error handling

### Sidecar Errors
- API key missing: Exit with error code, Rust detects and shows setup dialog
- Model rate limit: Return error, AI SDK may retry with backoff
- Tool call exception: Catch and return error message to AI

**Code**: `apps/sidecar/src/agent-server.ts` error handling in `runAgentQuery()`

## Streaming & Responsiveness

### Text Streaming

- AI generates text incrementally (token by token)
- Sidecar emits `text` events with deltas
- Frontend appends to streaming buffer
- Provides instant feedback to user

**Code**:
- Stream handling: `apps/sidecar/src/agent-server.ts:runAgentQuery()` (for await...fullStream)
- Frontend display: `apps/ui/src/components/AiPromptPanel.tsx`

### Tool Call Visualization

- Tool calls are shown in real-time as they happen
- User sees: "🔧 Using tool: apply_edit"
- Tool results are displayed: "✅ Edit applied successfully"
- Provides transparency into agent behavior

**Code**:
- State management: `apps/ui/src/hooks/useAiAgent.ts:currentToolCalls`
- Display: `apps/ui/src/components/AiPromptPanel.tsx` (tool call badges)

## Conversation Management

### Message History

- Last 5 exchanges kept in memory (not persisted yet)
- Includes user prompts, assistant responses, and tool calls
- Used for multi-turn conversations

**Future**: Persist to SQLite for conversation history UI

**Code**: `apps/ui/src/hooks/useAiAgent.ts:messages` state

### New Conversation

- Clears message history
- Resets error state
- Keeps sidecar running (no restart needed)

**Code**: `apps/ui/src/hooks/useAiAgent.ts:newConversation()`

## Provider Configuration

### Anthropic (Default)

- Model: `claude-sonnet-4-5`
- API Key: `ANTHROPIC_API_KEY` environment variable
- Streaming: Fully supported

### OpenAI (Alternative)

- Model: `gpt-4-turbo`
- API Key: `OPENAI_API_KEY` environment variable
- Enable via: `AI_PROVIDER=openai` environment variable

**Code**: `apps/sidecar/src/agent-server.ts:getModelProvider()`

## Future Enhancements

### Planned (Phase 3-4)

1. **Diff preview before apply**: Show visual diff, require user confirmation
2. **Undo/redo stack**: Track edit history, allow rollback
3. **Conversation persistence**: Save to SQLite, searchable history
4. **Custom tools**: Expose plugin API for user-defined tools
5. **Local LLM support**: llama.cpp integration for offline mode
6. **Multi-file awareness**: Context from `use`/`include` files

### Performance Optimizations

1. **Sidecar pooling**: Keep sidecar warm between queries
2. **Caching**: Cache tool results (e.g., `get_current_code`) within single query
3. **Streaming optimizations**: Batch text deltas to reduce IPC overhead

## Testing Strategy

### Manual Testing Checklist

- ✅ Store API key via settings dialog
- ✅ Query agent with "Create a cube"
- ✅ Verify tool calls appear in UI
- ✅ Accept diff and verify code changes
- ✅ Reject diff and verify no changes
- ✅ Test with invalid API key (should show error)
- ✅ Test with network failure (should recover)
- ✅ Cancel stream mid-response
- ✅ Multi-turn conversation (context preserved)

### Automated Testing (Planned)

- Unit tests for Rust tool handlers
- Integration tests for JSON-RPC protocol
- E2E tests for full agent workflow (Playwright)

## Debugging

### Enable Verbose Logging

**Sidecar**:
```bash
# In apps/sidecar/src/agent-server.ts
console.error('[Sidecar] Verbose logs enabled');
```

**Rust Backend**:
```rust
// In apps/ui/src-tauri/src/agent_sidecar.rs
eprintln!("[AgentSidecar] Debug: {:?}", message);
```

**Frontend**:
```typescript
// In apps/ui/src/hooks/useAiAgent.ts
console.log('[useAiAgent] Stream event:', event);
```

### Common Issues

1. **Sidecar won't start**: Check API key in keychain, verify Node.js installed
2. **Tool calls failing**: Check JSON-RPC request/response format in logs
3. **Diffs not applying**: Verify `old_string` is unique and exact (including whitespace)
4. **Stream hangs**: Check for uncaught exceptions in sidecar (stderr logs)

---

**Last Updated**: 2025-10-13
**Current Phase**: Phase 3 (AI Copilot Integration - In Progress)
**Status**: Core functionality implemented, polish in progress
