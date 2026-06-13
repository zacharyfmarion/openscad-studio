# Expandable AI Thinking Blocks

## Goal

Add expandable "Thinking" blocks to the AI transcript when a model/provider emits reasoning tokens that are available to the app. The UI should keep the current compact thinking indicator for streams that do not expose reasoning, but when reasoning chunks are present it should show a collapsed block the user can expand to inspect the model-provided reasoning text.

This plan is only for rendering reasoning that is actually present in the stream. The app should not synthesize hidden reasoning, ask a model to reveal private chain-of-thought, or infer content that was not delivered by the provider.

## Current State

- `apps/ui/src/utils/aiTurnState.ts` already receives Vercel AI SDK stream chunks.
- `reasoning-start`, `reasoning-delta`, and `reasoning-end` are explicitly handled today, but they are ignored.
- `deriveStreamingResponse()` only derives active assistant text parts from `text-start`/`text-delta`/`text-end`.
- `apps/ui/src/components/AiPromptPanel.tsx` shows:
  - persisted user, assistant, and tool-call messages;
  - active tool-call cards;
  - active streaming assistant text;
  - a generic animated "Thinking..." card when the turn is streaming with no text and no pending tool.
- `apps/ui/src/types/aiChat.ts` has no message type or assistant segment shape for reasoning content.
- `apps/ui/src/utils/aiMessages.ts` serializes conversation history back to model messages, and should continue to exclude thinking blocks unless a provider explicitly requires otherwise.

## UX Direction

- Keep thinking collapsed by default.
- Use a compact row with the existing three-dot activity indicator while reasoning is streaming.
- Label collapsed content as `Thinking` or `Thinking...` while active, and something like `Thinking details` after completion.
- Show the reasoning body only after the user expands it.
- Keep the body visually subordinate to normal assistant output:
  - smaller text;
  - muted foreground;
  - restrained border/background;
  - max height with internal scrolling for long reasoning.
- Preserve keyboard and screen-reader access:
  - use a real button or disclosure control;
  - expose `aria-expanded`;
  - connect the button to the collapsible region.
- Do not display a blank expandable block. If the provider emits reasoning lifecycle chunks but no non-whitespace content, keep the existing generic thinking indicator.

## Data Model

Add a reasoning segment type to `apps/ui/src/types/aiChat.ts`.

Suggested shape:

```ts
export interface ReasoningMessage extends BaseMessage {
  type: 'reasoning';
  turnId: string;
  content: string;
  state: AssistantMessageState;
}

export type Message = UserMessage | AssistantMessage | ToolCallMessage | ReasoningMessage;
```

For active streaming state in `aiTurnState.ts`, mirror the text-part model:

```ts
interface ActiveReasoningPart {
  id: string;
  text: string;
}

interface ActiveTurnState {
  activeReasoningPartsById: Record<string, ActiveReasoningPart>;
  activeReasoningPartOrder: string[];
  persistedReasoningSegments: ReasoningMessage[];
}
```

Open question to resolve during implementation: whether reasoning should become first-class transcript messages, as above, or metadata attached to assistant messages for the same turn. First-class messages are simpler because tool calls can appear between reasoning and assistant text, and the current transcript already handles ordered message segments.

## Stream Handling

1. Inspect the actual `TextStreamPart` payloads from the installed AI SDK version for reasoning chunks.
2. Add reducer cases in `reduceActiveTurnChunk()`:
   - `reasoning-start`: create an active reasoning part.
   - `reasoning-delta`: append chunk text to the matching active reasoning part.
   - `reasoning-end`: persist the reasoning part if it has non-whitespace content.
3. Add a flush path in `finalizeActiveTurn()` so partial reasoning is preserved on completion, cancellation, or error.
4. Add `deriveStreamingReasoning()` or `deriveCurrentReasoningBlocks()` for active reasoning UI state.
5. Update `useAiAgent.ts` state with a new field such as:

```ts
streamingReasoning: string | null;
currentReasoningMessages: ReasoningMessage[];
```

6. Keep `didReceiveResponseRef` logic aware of reasoning chunks so a provider that emits only reasoning initially still counts as an active response.
7. Continue ignoring unsupported `source`, `file`, `raw`, and approval chunks unless separately needed.

## Transcript Rendering

Add a small reusable component, likely in `AiPromptPanel.tsx` or a new `AiThinkingBlock.tsx`:

- props:
  - `content?: string`;
  - `state: 'streaming' | 'complete' | 'cancelled' | 'error'`;
  - `defaultExpanded?: boolean`;
- collapsed state:
  - animated dots while streaming;
  - title only after completion;
  - optional token/character count only if it feels useful and does not clutter the panel.
- expanded state:
  - render reasoning text in a pre-wrapped text container, not Markdown by default.
  - Reasoning can contain scratch syntax or partial tokens; Markdown rendering may make it look more authoritative than it is.

Render rules:

- For persisted `reasoning` messages, render the expandable thinking block in transcript order.
- For active streaming reasoning, render an expandable thinking block above active text/tool cards.
- If there is active reasoning content but no assistant text yet, replace the generic "Thinking..." placeholder with the expandable thinking block.
- If there is no reasoning content, keep the existing generic "Thinking..." placeholder exactly as today.

## Conversation History

- Persist reasoning blocks in local conversation history if the transcript persists other assistant/tool messages for that conversation.
- Do not send reasoning blocks back to the model in `messagesToModelMessages()`.
- Add a migration-safe fallback: unknown message types should be ignored by model-message serialization rather than crashing.
- Do not include reasoning content in analytics payloads.

## Provider Behavior

- Anthropic, OpenAI, and OpenAI-compatible providers may differ in what reasoning chunks the Vercel AI SDK exposes.
- Some local providers may emit reasoning as ordinary text, for example visible `<think>...</think>` content, rather than SDK `reasoning-*` chunks.
- This first pass should support SDK reasoning chunks only.
- A follow-up can sanitize visible `<think>` tags from ordinary text into thinking blocks if local OpenAI-compatible providers commonly stream them as text, but that should be separate because it is parser-sensitive and model-specific.

## Implementation Checklist

- [ ] Add `ReasoningMessage` to `apps/ui/src/types/aiChat.ts`.
- [ ] Extend `ActiveTurnState` with active and persisted reasoning segment state.
- [ ] Implement `reasoning-start`, `reasoning-delta`, and `reasoning-end` handling in `apps/ui/src/utils/aiTurnState.ts`.
- [ ] Add finalize/flush behavior for partial reasoning on complete, cancel, and error.
- [ ] Add selector helpers for active streaming reasoning.
- [ ] Thread reasoning state through `useAiAgent.ts`, `WorkspaceContext.tsx`, `PanelComponents.tsx`, and `AiPromptPanel.tsx`.
- [ ] Add an expandable thinking block component with accessible disclosure behavior.
- [ ] Render persisted and active reasoning blocks in the transcript.
- [ ] Ensure model-message serialization excludes reasoning blocks.
- [ ] Add tests for reducer behavior, cancellation/error finalization, transcript rendering, accessibility state, and model serialization.
- [ ] Manually test with a provider/model known to expose reasoning chunks through the AI SDK.

## Test Plan

Automated:

- `apps/ui/src/utils/__tests__/aiTurnState.test.ts`
  - persists completed reasoning chunks;
  - preserves partial reasoning on cancel/error;
  - does not create blank reasoning messages;
  - keeps reasoning ordered relative to text/tool messages.
- `apps/ui/src/hooks/__tests__/useAiAgent.test.tsx`
  - exposes active reasoning while streaming;
  - finalizes reasoning into transcript messages.
- `apps/ui/src/components/__tests__/AiPromptPanel.test.tsx`
  - shows generic `Thinking...` when no reasoning content exists;
  - shows collapsed thinking block when reasoning content exists;
  - expands/collapses with keyboard-accessible controls.
- `apps/ui/src/utils/__tests__/aiMessages.test.ts`
  - excludes reasoning messages from `messagesToModelMessages()`.

Manual:

- Verify a reasoning-capable hosted model if available.
- Verify a local OpenAI-compatible model that emits SDK reasoning chunks, if available.
- Confirm long reasoning text scrolls inside the expanded block without resizing the entire transcript awkwardly.
- Confirm normal models that do not expose reasoning still show the existing animated placeholder.

## Risks

- Provider support may be inconsistent. The UI should be capability-driven: no reasoning chunks, no expandable block.
- Reasoning content can be long. Use collapsed-by-default display and a max-height body.
- Some local models emit `<think>` tags as ordinary assistant text. Avoid parsing that in v1 unless validated with several model outputs.
- Reasoning may include sensitive prompt or tool context. Keep it local, exclude it from analytics, and do not include it in future model requests.
