# Export Dialog Project Context

## Goal

Make desktop export flows use the same project, working-directory, and library context as preview rendering so exports do not fail with empty output when the render target depends on sibling files or configured libraries.

## Approach

1. Add one shared export helper that reuses the existing project render-input builder and library loading logic.
2. Route both dialog-driven and menu-driven exports through that helper instead of calling the render service with raw source alone.
3. Add regression coverage for export context assembly and keep the implementation plan updated through validation and PR handoff.

## Affected Areas

- `apps/ui/src/components/ExportDialog.tsx`
- `apps/ui/src/App.tsx`
- `apps/ui/src/services/exportService.ts`
- `apps/ui/src/services/renderService.ts`
- `apps/ui/src/components/__tests__/ExportDialog.test.tsx`
- `apps/ui/src/services/__tests__/exportService.test.ts`
- `implementation-plans/export-dialog-project-context.md`

## Checklist

- [x] Reproduce the export failure and identify the missing render context
- [x] Add a shared export helper that reuses project render-input assembly
- [x] Update dialog and menu export paths to use the shared helper
- [x] Add regression coverage for export context propagation
- [x] Run shared validation through `scripts/validate-changes.sh`
- [ ] Create a draft PR against `main` with implementation notes and validation details
- [ ] Wait for the PR result and report the PR URL plus preview status
