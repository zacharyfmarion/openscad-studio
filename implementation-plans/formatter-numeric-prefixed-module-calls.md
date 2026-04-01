# Formatter Numeric Prefixed Module Calls

## Goal

Fix the OpenSCAD formatter so module calls like `1u()`, `1_25u()`, and `6_25u()` are preserved instead of being split into invalid tokens during formatting.

## Approach

Reproduce the parser/printer failure with focused regression fixtures and unit coverage, teach the container printers to preserve the parser's `ERROR + transform_chain` numeric-call pattern as a single statement, and validate the formatter remains idempotent.

## Affected Areas

- `apps/ui/src/utils/formatter/printer.ts`
- `apps/ui/src/utils/formatter/__tests__/formatter.test.ts`
- `apps/ui/src/utils/formatter/__tests__/formatter.integration.test.ts`
- `apps/ui/src/utils/formatter/__tests__/fixtures/`

## Checklist

- [x] Add failing formatter tests for standalone and transform-chain numeric-prefixed module calls
- [x] Patch printer handling for numeric-prefixed module call parse fragments
- [x] Verify idempotence and regression coverage
- [x] Run shared validation for the changed formatter files
