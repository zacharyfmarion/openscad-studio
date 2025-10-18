# AGENTS.md - AI Agent Architecture

This document describes the AI agent system architecture in OpenSCAD Studio, including the native Rust implementation, tool definitions, security model, and communication protocols.

## Overview

OpenSCAD Studio uses a **native Rust AI agent** with direct API integration, achieving the following goals:

1. **Security**: API keys stored in encrypted Tauri store, never exposed to renderer process
2. **Sandboxing**: AI editing is diff-based with validation and test compilation
3. **Transparency**: All tool calls are visible to the user
4. **Rollback**: Failed edits are automatically reverted
5. **Performance**: Direct API calls with streaming support, no intermediate processes

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
│  ├── ai_agent.rs            (Native Rust AI agent)          │
│  │   ├── send_ai_query     (Streaming API calls)            │
│  │   ├── run_ai_query      (Anthropic implementation)       │
│  │   ├── run_openai_query  (OpenAI implementation)          │
│  │   ├── execute_tool      (Tool execution router)          │
│  │   └── build_system_prompt (OpenSCAD context)             │
│  ├── cmd/ai.rs              (Encrypted store API keys)      │
│  ├── cmd/ai_tools.rs        (Tool implementations)          │
│  │   ├── apply_edit         (Diff validation & apply)       │
│  │   ├── get_current_code   (Return editor buffer)          │
│  │   ├── get_diagnostics    (Return OpenSCAD errors)        │
│  │   ├── get_preview_screenshot (Return file:// path)       │
│  │   └── trigger_render     (Manual render trigger)         │
│  └── cmd/conversations.rs   (Conversation persistence)      │
└────────────────┬────────────────────────────────────────────┘
                 │ HTTPS (reqwest)
                 ▼
        ┌───────────────────┐
        │  Anthropic API    │
        │  (Claude 4.5)     │
        └───────────────────┘
                 │
                 ▼
        ┌───────────────────┐
        │  OpenAI API       │
        │  (GPT-4)          │
        └───────────────────┘
```

## Security Model

### API Key Storage

**Problem**: API keys must never be accessible to the renderer process (untrusted code).

**Solution**: Encrypted storage with backend-only access:
1. **Tauri Encrypted Store**: Keys stored via `tauri-plugin-store` with encryption at rest
2. **Backend Isolation**: Retrieved by Rust backend only, never sent to frontend
3. **Per-Provider Storage**: Separate keys for Anthropic and OpenAI providers

**Code References**:
- Storage operations: `apps/ui/src-tauri/src/cmd/ai.rs` (store_api_key, get_api_key_for_provider, clear_api_key)
- Store initialization: `apps/ui/src-tauri/src/lib.rs` (tauri_plugin_store setup)

### Diff-based Editing

**Problem**: AI models can hallucinate or generate unsafe code.

**Solution**: All edits use exact string replacement with validation:
1. **Exact match**: `old_string` must exist exactly once in the file
2. **Size limit**: Maximum 120 lines changed per edit
3. **Test compilation**: OpenSCAD renders the code to check for errors before accepting
4. **Automatic rollback**: If new errors are introduced, revert to previous state
5. **User visibility**: All tool calls and results shown in chat interface

**Code References**:
- Diff validation: `apps/ui/src-tauri/src/cmd/ai_tools.rs:handle_apply_edit()`
- Tool executor: `apps/ui/src-tauri/src/ai_agent.rs:execute_tool()`

## Communication Protocol

### Frontend → Backend (Tauri IPC)

**Command**: `send_ai_query`

```typescript
interface QueryRequest {
  messages: Array<{
    role: 'user' | 'assistant';
    content: string;
  }>;
  model?: string;  // Optional model override
  provider?: string;  // Optional provider override
}
```

**Events** (Backend → Frontend):
- `ai-stream`: Unified stream event with type discriminator
  - `type: "text"`: Streaming text delta from AI
  - `type: "tool-call"`: Tool invocation started
  - `type: "tool-result"`: Tool invocation completed
  - `type: "error"`: Error occurred
  - `type: "done"`: Stream completed

**Code References**:
- Frontend hook: `apps/ui/src/hooks/useAiAgent.ts:submitPrompt()`
- Backend handler: `apps/ui/src-tauri/src/ai_agent.rs:send_ai_query()`
- Event listener: `apps/ui/src/hooks/useAiAgent.ts` (useEffect with `listen('ai-stream')`)

### Backend → API (Direct HTTPS)

**Anthropic API**:
```rust
POST https://api.anthropic.com/v1/messages
Headers:
  x-api-key: {api_key}
  anthropic-version: 2023-06-01
  content-type: application/json

Body:
{
  "model": "claude-sonnet-4-5",
  "max_tokens": 8000,
  "system": "{system_prompt}",
  "messages": [...],
  "tools": [...],
  "stream": true
}
```

**OpenAI API**:
```rust
POST https://api.openai.com/v1/chat/completions
Headers:
  Authorization: Bearer {api_key}
  content-type: application/json

Body:
{
  "model": "gpt-4",
  "messages": [...],
  "tools": [...],
  "stream": true
}
```

**Code References**:
- Anthropic implementation: `apps/ui/src-tauri/src/ai_agent.rs:run_ai_query()`
- OpenAI implementation: `apps/ui/src-tauri/src/ai_agent.rs:run_openai_query()`

## Tool Definitions

### 1. `get_current_code`

**Purpose**: Retrieve the current editor buffer contents

**Parameters**: None

**Returns**: String (OpenSCAD code)

**Implementation**:
- Reads from `EditorState` global state
- Returns full file contents
- Returns "// Empty file" if buffer is empty

**Code**: `apps/ui/src-tauri/src/ai_agent.rs:execute_tool()` (case "get_current_code")

### 2. `get_preview_screenshot`

**Purpose**: Get file path to the current rendered preview (PNG/SVG/STL)

**Parameters**: None

**Returns**: String (file:// path with explanation)

**Use Case**: AI can "see" the rendered output to understand what the design looks like

**Implementation**:
- Returns path from last successful render stored in EditorState
- Includes explanatory text for the AI

**Code**: `apps/ui/src-tauri/src/ai_agent.rs:execute_tool()` (case "get_preview_screenshot")

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

**Response Format**:
- Success: "✅ Edit applied successfully!\n✅ Code compiles without new errors\n✅ Preview has been updated automatically\n\nRationale: {rationale}\n\nThe changes are now live in the editor."
- Failure: "❌ Failed to apply edit: {error}\n\nCompilation errors after applying edit:\n{diagnostics}\n\nRationale: {rationale}\n\nThe edit was rolled back. No changes were made. Please fix the errors and try again."

**Code**: `apps/ui/src-tauri/src/ai_agent.rs:execute_tool()` (case "apply_edit")

### 4. `get_diagnostics`

**Purpose**: Retrieve current OpenSCAD errors and warnings

**Parameters**: None

**Returns**: Formatted diagnostic list or success message

**Use Case**: AI can see what's broken and propose fixes

**Response Format**:
- No errors: "✅ No errors or warnings. The code compiles successfully."
- With errors: "Current diagnostics:\n\n[Error] (line X, col Y): message\n[Warning] (line Z): message"

**Code**: `apps/ui/src-tauri/src/ai_agent.rs:execute_tool()` (case "get_diagnostics")

### 5. `trigger_render`

**Purpose**: Manually trigger a preview render

**Parameters**: None

**Returns**: Success message

**Use Case**: Force render after edits (though auto-render usually handles this)

**Implementation**:
- Emits `render-requested` Tauri event
- Frontend listens and calls `manualRender()`

**Code**:
- Tool handler: `apps/ui/src-tauri/src/ai_agent.rs:execute_tool()` (case "trigger_render")
- Event listener: `apps/ui/src/App.tsx` (useEffect with `listen('render-requested')`)

## System Prompt

The AI agent uses a specialized system prompt with:
- Role definition (OpenSCAD expert assistant)
- Tool descriptions and usage guidelines
- Critical rules for editing (exact string matching, max 120 lines)
- OpenSCAD quick reference (primitives, transformations, boolean ops)
- Recommended workflow (get code → check diagnostics → apply edit)

**Location**: `apps/ui/src-tauri/src/ai_agent.rs:build_system_prompt()`

**Key Guidelines**:
- "ALWAYS use exact string replacement: Never output full file replacements"
- "Provide exact substrings including whitespace and indentation"
- "Include context to make old_string unique"
- "apply_edit validates and test-compiles before applying"

## Multi-Turn Tool Calling

Both Anthropic and OpenAI implementations support multi-turn conversations with automatic tool execution:

### Flow:
1. User sends message
2. Backend makes API call with tools
3. AI responds with text and/or tool calls
4. Backend executes tools locally
5. Backend adds tool results to conversation
6. Backend makes another API call (loop to step 3)
7. AI sees results and responds to user
8. Stream completes with "done" event

### Anthropic Format:
```json
// Assistant message with tool uses
{
  "role": "assistant",
  "content": [
    { "type": "text", "text": "I'll check the code" },
    { "type": "tool_use", "id": "...", "name": "get_current_code", "input": {} }
  ]
}

// User message with tool results
{
  "role": "user",
  "content": [
    { "type": "tool_result", "tool_use_id": "...", "content": "cube([10,10,10]);" }
  ]
}
```

### OpenAI Format:
```json
// Assistant message with tool calls
{
  "role": "assistant",
  "content": null,
  "tool_calls": [
    { "id": "call_0", "type": "function", "function": { "name": "get_current_code", "arguments": "{}" } }
  ]
}

// Tool result message
{
  "role": "tool",
  "tool_call_id": "call_0",
  "content": "cube([10,10,10]);"
}
```

**Code References**:
- Anthropic loop: `apps/ui/src-tauri/src/ai_agent.rs:run_ai_query()` (multi-turn loop)
- OpenAI loop: `apps/ui/src-tauri/src/ai_agent.rs:run_openai_query()` (multi-turn loop)

## Streaming & Responsiveness

### Server-Sent Events (SSE) Parsing

Both APIs use SSE format for streaming:

```
data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Hello"}}

data: [DONE]
```

**Implementation**:
- Process byte stream incrementally
- Buffer incomplete lines
- Parse complete `data:` lines as JSON
- Handle different event types (text deltas, tool calls, etc.)

**Code**: Both `run_ai_query()` and `run_openai_query()` contain stream processing loops

### Text Streaming

- AI generates text incrementally (token by token)
- Backend emits `ai-stream` events with `type: "text"` and delta content
- Frontend appends to streaming buffer
- Provides instant feedback to user

**Code**:
- Stream handling: Content block delta processing in both query functions
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

- Conversation state managed in frontend
- Messages array passed to each `send_ai_query` call
- Includes user prompts, assistant responses (reconstructed from streams)
- Used for multi-turn conversations

**Implementation**: `apps/ui/src/hooks/useAiAgent.ts:messages` state

### Conversation Persistence

- Conversations saved to disk via `save_conversation` command
- Loaded on startup via `load_conversations` command
- SQLite-based storage (planned) or JSON file storage

**Code References**:
- Save command: `apps/ui/src-tauri/src/cmd/conversations.rs:save_conversation()`
- Load command: `apps/ui/src-tauri/src/cmd/conversations.rs:load_conversations()`
- Delete command: `apps/ui/src-tauri/src/cmd/conversations.rs:delete_conversation()`

### New Conversation

- Clears message history in frontend
- Resets error state
- No backend restart needed

**Code**: `apps/ui/src/hooks/useAiAgent.ts:startNewConversation()`

## Provider Configuration

### Anthropic (Default)

- Models: `claude-sonnet-4-5`, `claude-sonnet-3.5`
- API Key: Stored separately in encrypted store
- Streaming: Fully supported
- Tool calling: Native support via `tools` parameter

### OpenAI (Alternative)

- Models: `gpt-4`, `gpt-4-turbo`
- API Key: Stored separately in encrypted store
- Streaming: Fully supported
- Tool calling: Function calling API

**Model Selection**:
- User selects model from dropdown in AI chat panel
- Provider auto-determined from model name prefix
- Settings dialog allows managing API keys per provider

**Code**:
- Model management: `apps/ui/src-tauri/src/cmd/ai.rs:get_ai_model()`, `set_ai_model()`
- Provider detection: `apps/ui/src-tauri/src/cmd/ai.rs:get_ai_provider()`
- Model selector: `apps/ui/src/components/ModelSelector.tsx`

## Cancellation

### User-Initiated Cancellation

User can cancel ongoing streams via cancel button in UI.

**Implementation**:
1. User clicks cancel button
2. Frontend calls `cancel_ai_stream` command
3. Backend triggers `CancellationToken`
4. Stream processing loop checks token periodically
5. On cancellation, loop exits gracefully
6. No more events emitted

**Code**:
- Frontend: `apps/ui/src/hooks/useAiAgent.ts:cancelStream()`
- Backend: `apps/ui/src-tauri/src/ai_agent.rs:cancel_ai_stream()`
- Token checks: Multiple locations in stream processing loops

## Error Handling

### Frontend Errors
- Network failures: Display error banner in UI
- Streaming interruption: Allow retry
- Tool call failures: Show in conversation history
- API errors: Display error message from API response

**Code**: `apps/ui/src/hooks/useAiAgent.ts:error` state

### Backend Errors
- API authentication failures: Return error to frontend with helpful message
- Rate limiting: Return API error message to frontend
- Tool handler errors: Return error message in tool result, AI can see and retry
- Stream parsing errors: Logged to stderr, graceful fallback

**Code**: Error handling throughout `apps/ui/src-tauri/src/ai_agent.rs`

### Tool Execution Errors
- Validation failures: Return descriptive error in tool result
- Compilation failures: Return error with diagnostics, trigger rollback
- File access errors: Return error message

**Code**: `apps/ui/src-tauri/src/ai_agent.rs:execute_tool()` (error branches)

## Performance Characteristics

### Latency Targets
- **First token**: < 2s (depends on API)
- **Subsequent tokens**: ~50-100ms apart (streaming)
- **Tool execution**: < 500ms per tool
- **End-to-end**: Variable, depends on complexity

### Resource Usage
- **Memory**: Minimal, streams processed incrementally
- **CPU**: Low during streaming, spikes during tool execution (OpenSCAD compilation)
- **Network**: Bandwidth depends on stream verbosity

### Optimization Strategies
- Incremental SSE parsing (no buffering full response)
- Async tool execution
- Cancellation support to avoid wasted work
- Content-hash caching for render operations

## Testing Strategy

### Manual Testing Checklist

- ✅ Store API key via settings dialog
- ✅ Query agent with "Create a cube"
- ✅ Verify tool calls appear in UI
- ✅ Verify streaming text appears incrementally
- ✅ Test with invalid API key (should show error)
- ✅ Test with network failure (should recover)
- ✅ Cancel stream mid-response
- ✅ Multi-turn conversation (context preserved)
- ✅ Switch models mid-conversation
- ✅ Test both Anthropic and OpenAI providers

### Automated Testing (Planned)

- Unit tests for Rust tool handlers
- Integration tests for streaming protocol
- E2E tests for full agent workflow (Playwright)

## Debugging

### Enable Verbose Logging

**Rust Backend**:
```rust
// In apps/ui/src-tauri/src/ai_agent.rs
eprintln!("[AI Agent] Debug: {:?}", message);
```

Logs appear in terminal when running `pnpm tauri:dev`

**Frontend**:
```typescript
// In apps/ui/src/hooks/useAiAgent.ts
console.log('[useAiAgent] Stream event:', event);
```

Logs appear in browser DevTools console

### Common Issues

1. **Stream not starting**: Check API key is set for the correct provider
2. **Tool calls failing**: Check exact string matching in `apply_edit` (whitespace matters)
3. **Compilation errors after edit**: Check validation logic, should rollback
4. **Stream hangs**: Check for API rate limits or network issues
5. **Wrong provider used**: Verify model name matches expected provider

### Inspection Tools

- **Network**: Use `eprintln!` to log request/response bodies
- **State**: Add debug prints in `EditorState` access
- **Events**: Log all `ai-stream` events in frontend
- **Tools**: Log tool inputs and outputs in `execute_tool()`

## Future Enhancements

### Planned (Phase 4+)

1. **Diff preview before apply**: Show visual diff, require user confirmation
2. **Undo/redo stack**: Track edit history, allow rollback
3. **Custom tools**: Plugin API for user-defined tools
4. **Local LLM support**: llama.cpp integration for offline mode
5. **Multi-file awareness**: Context from `use`/`include` files
6. **Conversation branching**: Fork conversations at any point
7. **Prompt templates**: Reusable prompts for common tasks

### Performance Optimizations

1. **Request coalescing**: Batch multiple tool results before next turn
2. **Caching**: Cache tool results within single query (e.g., `get_current_code`)
3. **Parallel tool execution**: Execute independent tools concurrently
4. **Streaming optimizations**: Reduce event emission frequency

---

**Last Updated**: 2025-10-18
**Current Phase**: Phase 3 Complete (Native Rust AI Implementation)
**Status**: Production-ready, monitoring for edge cases
