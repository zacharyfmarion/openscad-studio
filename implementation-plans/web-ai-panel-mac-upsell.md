# Web AI Panel Mac Upsell

## Goal

Add a short web AI panel empty-state upsell that tells users they can use existing desktop AI subscriptions like Claude Code by downloading the Mac app, and instrument it so impressions and clicks can be measured.

## Approach

- Reuse the existing Mac download URL behavior outside `App.tsx` so the AI panel can link to the right release asset.
- Show a compact two-path setup chooser only in the web no-key AI panel state, keeping the desktop MCP setup unchanged.
- Keep `Add API Key` as the primary action and present Mac download as a quieter alternate path for desktop agents.
- Track setup impressions and option clicks so the two paths can be compared.
- Add focused component coverage for the new copy, platform gating, and analytics calls.

## Affected Areas

- `apps/ui/src/App.tsx`
- `apps/ui/src/components/AiPromptPanel.tsx`
- `apps/ui/src/components/AiAccessEmptyState.tsx`
- `apps/ui/src/components/__tests__/AiPromptPanel.test.tsx`
- `apps/ui/src/components/__tests__/AiAccessEmptyState.test.tsx`
- `e2e/tests/ai/ai-chat.spec.ts`
- `e2e/tests/integration/keyboard-shortcuts.spec.ts`
- `e2e/tests/panels/customizer-panel.spec.ts`
- new shared Mac download helper under `apps/ui/src/hooks/`

## Checklist

- [x] Create implementation plan
- [x] Extract reusable Mac download URL helper
- [x] Add web-only AI panel upsell and analytics
- [x] Add focused component tests
- [x] Update AI panel E2E assertions for the refined no-key setup state
- [x] Run formatting and validation
- [x] Open draft PR and report preview URL
