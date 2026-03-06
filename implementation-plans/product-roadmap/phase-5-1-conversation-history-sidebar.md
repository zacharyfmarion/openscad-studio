# Phase 5.1: Conversation History Sidebar

## Summary

Implement a new Dockview panel (`Conversations`) that renders a `ConversationHistoryPanel` backed by a small Zustand store that lists/searches/deletes conversations via the existing `PlatformBridge`, and loads a selected conversation via `useAiAgent.loadConversation`. Client-side search, auto-generated titles, robust UX around streaming/deletion/error states.

## Effort Estimate

Medium (1–2 days)

## Action Plan

1. Define a shared conversation metadata shape (id/title/updatedAt/messageCount) returned by `PlatformBridge.listConversations()`.
2. Add a Zustand `conversationHistoryStore` to fetch/sort/filter the list and drive loading/error/deleting UI states.
3. Build `ConversationHistoryPanel` with search input, list, empty/error states, and delete-confirm dialog.
4. Register a new Dockview panel type (`conversations`) and add it to panel options.
5. Implement switch conversation UX (handle streaming guard and optional dirty warning).
6. Add styling consistent with existing panels and ensure keyboard/screen reader accessibility.
7. Add Playwright E2E coverage using mock conversation data.

## Component Design

- **`ConversationHistoryPanel`** (container): fetch on mount, search input, renders states
- Sub-components:
  - `ConversationSearchInput` (debounced text input, clear button)
  - `ConversationList` (simple list, no virtualization needed initially)
  - `ConversationListItem` (title, date, count, delete icon)
  - `ConfirmDeleteDialog` (modal, focus-trapped)
  - `PanelEmptyState` / `PanelErrorState`

## Data Model

```ts
interface ConversationMetadata {
  id: string;
  title: string;
  updatedAt: number;
  messageCount: number;
}
```

- Sort: descending by `updatedAt`
- Filter: case-insensitive substring match on `title`

## State Management (Zustand Store)

```ts
interface ConversationHistoryState {
  items: ConversationMetadata[];
  status: 'idle' | 'loading' | 'error';
  error?: string;
  searchQuery: string;
  selectedId?: string;
  deletingIds: Record<string, true>;
  refresh(): void;
  remove(id: string): void;
}
```

## Key UX Decisions

- **Streaming guard**: If AI is streaming, block switching and show confirm: "Stop response and switch?"
- **Deletion**: Optimistic UI removal with rollback on failure. If deleted conversation is active → auto-start New Chat.
- **Titles**: Auto-generate from first user message (trimmed, max ~60 chars). User-editable titles deferred.
- **New Chat**: Button at top of panel calls `useAiAgent.startNewConversation()`.

## Platform Differences

- Desktop: Tauri commands (`load_conversations`, `delete_conversation`)
- Web: `WebConversationService` localStorage
- UI is identical — relies on `PlatformBridge` to unify

## Error Handling

- List refresh failure: inline error block with "Retry"
- Load conversation failure: keep current conversation, show toast
- Corrupted entries: skip invalid items

## Edge Cases

- Loading while streaming → require cancel/confirm
- Deleting active conversation → start new chat after success
- Empty history → CTA to start chat

## Accessibility

- Search input: `aria-label="Search conversations"`, clear button accessible
- List: buttons for rows with visible focus rings
- Dialog: focus trap, `aria-describedby`, Escape closes
