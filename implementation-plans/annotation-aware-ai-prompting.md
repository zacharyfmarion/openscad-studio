# Annotation-Aware AI Prompting

## Goal

Teach the AI to treat viewer annotation marks as intentional user guidance rather than OpenSCAD geometry, and bias its response toward the marked area when annotated screenshots are attached.

## Approach

- Preserve the attachment source surface on normalized draft attachments so the AI layer can recognize viewer-generated annotation images.
- Add a concise annotation rule to the global AI system prompt and prepend a short annotation-specific text part only for submitted drafts that include `viewer_annotation` attachments.
- Cover the metadata plumbing and submitted message construction with focused unit tests.

## Affected Areas

- `apps/ui/src/types/aiChat.ts`
- `apps/ui/src/utils/aiAttachments.ts`
- `apps/ui/src/hooks/useAiAgent.ts`
- `apps/ui/src/services/aiService.ts`
- `apps/ui/src/hooks/__tests__/useAiAgent.test.tsx`
- `apps/ui/src/utils/__tests__/aiAttachments.test.ts`

## Checklist

- [x] Add attachment source metadata support to the AI attachment types and processing utilities
- [x] Inject annotation-aware guidance into submitted AI messages only for viewer annotation attachments
- [x] Add a brief global system prompt rule for interpreting annotated screenshots
- [x] Add or update focused tests for metadata preservation and annotated submit behavior
- [x] Run targeted validation for the changed scope
