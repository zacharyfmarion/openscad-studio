# Customizer Textarea Support

## Goal

Add support for rendering large customizer text parameters as a textarea so makers can comfortably edit longer text content without leaving the customizer.

## Approach

- Extend customizer metadata parsing with an explicit textarea presentation mode for string parameters.
- Update string parsing and serialization so escaped newlines and quotes round-trip safely through the customizer.
- Render textarea-backed string controls with sensible sizing while preserving existing single-line string behavior.
- Add focused parser, replacement, and component tests for the new metadata and string round-tripping behavior.

## Affected Areas

- `apps/ui/src/utils/customizer/types.ts`
- `apps/ui/src/utils/customizer/parser.ts`
- `apps/ui/src/utils/customizer/replaceParamValue.ts`
- `apps/ui/src/components/customizer/ParameterControl.tsx`
- `apps/ui/src/components/CustomizerPanel.tsx`
- `apps/ui/src/services/aiService.ts`
- related unit/component tests

## Checklist

- [x] Add textarea-oriented metadata support to customizer types and parser
- [x] Update customizer string formatting to safely encode large text content
- [x] Render textarea controls for flagged string parameters in the customizer UI
- [x] Add or update parser, replacement, and component tests
- [x] Run targeted validation and record any intentionally skipped checks
