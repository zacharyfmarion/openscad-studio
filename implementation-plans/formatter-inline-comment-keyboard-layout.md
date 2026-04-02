# Formatter Inline Comment Keyboard Layout

## Goal

Fix the OpenSCAD formatter so keyboard layout files with inline row comments, including the `\` key annotation, remain renderable after save + auto-format.

## Approach

Reproduce the failure with a formatter regression test based on the reported layout pattern, update the printer so inline comments inside multiline lists cannot corrupt the following line structure, and validate the formatter output stays idempotent and compilable.

## Affected Areas

- `apps/ui/src/utils/formatter/printer.ts`
- `apps/ui/src/utils/formatter/__tests__/formatter.test.ts`
- `apps/ui/src/utils/formatter/__tests__/formatter.integration.test.ts`
- `apps/ui/src/utils/formatter/__tests__/fixtures/`

## Checklist

- [x] Reproduce the reported formatting failure with a focused fixture or test
- [x] Patch multiline list comment printing so formatted output remains valid
- [x] Add regression coverage for the keyboard layout pattern
- [x] Run targeted formatter tests and compile validation
- [x] Run shared validation for changed files
