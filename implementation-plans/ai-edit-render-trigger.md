# Add `ai_edit` Render Trigger and Model Attribution

## Goal

Make AI-originated renders distinguishable from manual edits in PostHog analytics. Currently both paths emit `trigger: 'code_update'`. Adding `trigger: 'ai_edit'` plus `ai_model_id` / `ai_provider` properties lets us answer: "what fraction of error renders came from AI edits, and which model produced them?"

## Approach

- Extend the `RenderTrigger` union with `'ai_edit'`
- Tag renders that follow AI `apply_edit` or `trigger_render` tool calls with the new trigger
- Read `getStoredModel()` in `trackRenderCompleted` when the trigger is `'ai_edit'` to attach model and provider without threading extra state through the render pipeline

## Affected Areas

- `apps/ui/src/analytics/runtime.tsx` — `RenderTrigger` type
- `apps/ui/src/platform/eventBus.ts` — `render-requested` event payload type
- `apps/ui/src/services/aiService.ts` — `apply_edit` and `trigger_render` tool execute functions
- `apps/ui/src/App.tsx` — `code-updated` and `render-requested` eventBus listeners
- `apps/ui/src/hooks/useOpenScad.ts` — `trackRenderCompleted` analytics call

## Checklist

- [x] Add `'ai_edit'` to `RenderTrigger` union in `analytics/runtime.tsx`
- [x] Update `render-requested` EventMap type to carry optional `{ source?: 'ai' }`
- [x] Change `apply_edit` in `aiService.ts` to use `requestRender('ai_edit', ...)`
- [x] Change `trigger_render` in `aiService.ts` to emit `render-requested` with `{ source: 'ai' }`
- [x] Update `code-updated` listener in `App.tsx` to map `eventSource === 'ai'` → `'ai_edit'`
- [x] Update `render-requested` listener in `App.tsx` to map `source === 'ai'` → `'ai_edit'`
- [x] Update `WebMenuBar.tsx` emit call to pass `{}` (required by new EventMap type)
- [x] Add `ai_model_id` / `ai_provider` to `trackRenderCompleted` in `useOpenScad.ts`
- [x] Run `baseline` validation (574 tests pass, format/lint/type-check all clean)
- [ ] Open draft PR
