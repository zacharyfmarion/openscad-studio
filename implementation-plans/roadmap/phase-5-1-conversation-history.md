# Conversation History Sidebar — Implementation Plan

## 1) Overview

Conversation history adds "pick up where I left off" continuity: users can return to prior design discussions, compare iterations, and reuse prompts without losing context. It reduces fear of experimenting because chats feel durable and navigable.

---

## 2) Component Design

### Primary: `ConversationHistorySidebar` (dockview panel)

- **Panel ID**: `conversation-history`
- **Placement**: docked left of or below the AI chat panel group (user can rearrange via dockview)
- **Responsibilities**: Fetch/display conversation summaries, search/filter, handle selection/deletion/new

### `ConversationListItem`

Compact row: title (1 line, ellipsis), preview snippet (1 line), relative updated time + message count, delete icon on hover.

### `ConversationSearchBar`

Text input (debounced) in sidebar header. Optional filter chips later.

---

## 3) Data Model

```ts
interface ConversationSummary {
  id: ConversationId;
  title: string;
  createdAt: string; // ISO
  updatedAt: string; // ISO
  messageCount: number;
  preview: string; // first user message, trimmed
  schemaVersion: 1;
}
```

### Title generation

- Title = first non-empty user message, truncated to 60 chars
- Fallback = `New conversation — Mar 6`

### Sort order

- Most recent first: `updatedAt desc`

---

## 4) Interactions

- **Click to load**: Cancel stream if active → auto-save current (if dirty) → `loadConversation(id)` → update active id
- **Delete**: Hard delete with confirmation modal
- **Search**: v1 searches titles + preview; v2 optionally full-text
- **New conversation**: Auto-save current → `startNewConversation()`
- **Auto-save**: On message boundary (user sends, assistant finishes) + on switch. Throttled.

---

## 5) UX Design

- **Empty state**: "No conversations yet" + helper text + "New conversation" action
- **Loading state**: Skeleton rows + disabled search
- **Active highlight**: Selected row styling (background + left border)
- **Date formatting**: Relative ("2h ago", "Yesterday") with tooltip for exact timestamp
- **Keyboard**: ↑/↓ moves selection, Enter opens, Delete triggers confirmation

---

## 6) Edge Cases

1. **Switching while streaming**: Cancel stream → finalize partial message → save → switch
2. **Code references in old conversations**: Don't auto-restore editor code from chat
3. **Long conversation list**: Start without virtualization; add at >300 items
4. **Web/desktop format compatibility**: `schemaVersion` + migration on read
5. **Duplicate names**: Allow; disambiguate visually via time + preview

---

## 7) Error Handling

- **Failed to load**: Inline error + retry button
- **Failed to save**: Toast + keep dirty flag; retry on next boundary
- **Corrupted data**: Skip record, log, show "Some conversations couldn't be loaded"

---

## 8) Platform Considerations

UI talks only to `PlatformBridge.ConversationService`. Desktop maps to Tauri commands; web maps to localStorage. Same schema and migration logic everywhere.

---

## 9) Implementation Steps

1. Define shared types + versioning + migration function
2. Extend `ConversationService` surface: `listSummaries()`, `load(id)`, `save()`, `delete(id)`
3. Create `useConversationHistory()` hook (loading, error, search, filtered list)
4. Build `ConversationHistorySidebar` UI (dockview panel)
5. Wire interactions to `useAiAgent` (stream cancel, autosave, load)
6. Delete flow + confirmation
7. Autosave boundaries + resilience

**Effort estimate:** Medium (1–2 days)
