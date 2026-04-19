# AI Transcript Auto-Scroll

## Goal

Make the AI transcript behave like a professional chat app while responses stream: keep following the latest output when the user is already at the bottom, but stop forcing the panel downward when they intentionally scroll up to read earlier text.

## Approach

- Replace the unconditional "always jump to the bottom" effect in `AiPromptPanel.tsx` with scroll-aware follow behavior.
- Track whether the transcript is currently pinned near the bottom so new streaming content only auto-scrolls when the user has not opted out by scrolling upward.
- Add a visible "Jump to latest" affordance so users can quickly resume following the live response after pausing the transcript.
- Add component coverage for both the pinned and paused states.

## Affected Areas

- `apps/ui/src/components/AiPromptPanel.tsx`
- `apps/ui/src/components/__tests__/AiPromptPanel.test.tsx`
- `implementation-plans/ai-transcript-auto-scroll.md`

## Checklist

- [x] Capture the implementation plan before editing the transcript behavior.
- [x] Update the AI transcript to pause auto-scroll when the user scrolls away from the bottom.
- [x] Add or update component tests for the new transcript scroll behavior.
- [x] Run relevant validation for the frontend-only changes.
- [x] Prepare the branch and draft PR handoff.
