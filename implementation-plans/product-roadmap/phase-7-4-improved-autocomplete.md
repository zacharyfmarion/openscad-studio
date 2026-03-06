# Phase 7.4: Improved Autocomplete

## Summary

Implement a single Monaco `CompletionItemProvider` backed by a cached Tree-sitter parse + symbol index, with layered contextual completion sources (translate/$fn/color/params/vars) and a unified ranking pipeline.

## Effort Estimate

Medium (1–2d) for first usable version; Large (3d+) for robust cross-file + scope accuracy.

## Action Plan

1. Register one OpenSCAD completion provider with trigger characters and fast "cheap context" gate.
2. Add incremental Tree-sitter pipeline per Monaco model producing: syntax tree, symbol table, scope map.
3. Build data-driven built-in catalog (keywords/modules/functions + param metadata + docstrings).
4. Implement context detectors (translate/color/$fn/argument-name position) using AST-at-cursor with text fallback.
5. Add user-defined completions (modules/functions/vars/params) from symbol index + cross-file resolver.
6. Implement ranking function (specificity + scope distance + usage stats + recency) mapped to Monaco `sortText`.
7. Add tests for context detection + symbol extraction + ranking.

## Monaco CompletionItemProvider API

- Registration: `monaco.languages.registerCompletionItemProvider('openscad', provider)`
- Trigger characters: `['$', '(', ',', '=', '[', '"']`
- Return: `{ suggestions: CompletionItem[] }` with `label`, `kind`, `insertText`, `range`, `documentation`, `sortText`, `filterText`

## Context Detection

- Primary signal: AST-at-cursor (convert Monaco position to offset, query Tree-sitter)
- Cheap context first pass: skip work in comments/strings
- Three core states:
  1. Inside call arguments (which callee): `translate( … | … )`
  2. Inside named argument key position: `cube(si|)`
  3. Inside value position: after `=` or `,` within args

## Built-in Completions

- Single authoritative catalog (JSON/TS module): `name`, `kind`, `signature`, `doc`, `params[]`, optional `snippet`
- Categories: Keywords, Core modules, Primitives, Functions (math/trig/list/string)

## Contextual Suggestions

### `translate([...])`

- Detect `calleeName === 'translate'` + cursor inside first arg
- Suggest vector patterns: `[0, 0, 0]`, `[x, y, z]`

### `$fn =`

- Detect assignment where lhs is `$fn` + cursor in value position
- Suggest common integers: 32, 64, 128

### `color("...")`

- Detect `calleeName === 'color'` + cursor inside first arg string
- Suggest named colors with swatches (see Color Completions)

## User-Defined Completions

- Extract from Tree-sitter: `module_definition`, `function_definition`, assignments
- Per-file symbol table: `kind`, `definedAtRange`, `scopeNodeId`, `params[]`
- Prefer user-defined over built-ins when names collide

## Scope-Aware Variables

- Build scope stack per AST node:
  - New scope at: module/function body, `let(...)`, `for(...)` body
  - At cursor: collect bindings outward through parent scopes
- Return with `CompletionItemKind.Variable` and detail like `var (local)` / `var (from include)`

## Parameter Name Completion

- Trigger: inside call args at identifier position before `=`
- Source priority: user-defined callable params → built-in catalog params
- Filter: suggest only params not already present in the call
- Insert: `"center = $1"` as snippet

## Color Completions

- Color list as `{ name, hex }` (CSS/X11 set)
- `kind: monaco.languages.CompletionItemKind.Color`
- Replace only string content (range excludes quotes)
- Documentation: `"■ **red** \`#ff0000\`"`

## Numeric Value Suggestions

- `$fn`: `[12, 24, 32, 48, 64, 96, 128]`
- `$fa`: `[1, 2, 5, 6, 12]`
- `$fs`: `[0.25, 0.5, 1, 2]`
- Common angles: `[0, 30, 45, 60, 90, 120, 180, 270, 360]`
- Booleans for `center`: `true/false`

## Cross-File Completions

- Build project index keyed by resolved file URI
- `use <file>`: expose module/function definitions
- `include <file>`: treat as globally available
- Update on file change; notify dependents

## Ranking Algorithm

- **Context match** (highest): inside `color("...")` boost colors; inside `$fn=` boost numeric
- **Scope distance**: local > outer > imported > built-in
- **Prefix quality**: exact/prefix > fuzzy > substring
- **Usage frequency**: count identifier occurrences per project
- **Recency**: boost symbols near cursor
- Implementation: `sortText = padLeft(9999 - score, 4) + "_" + label`

## Performance

- Parse/index off hot path: debounce `model.onDidChangeContent` (75–150ms), update Tree-sitter incrementally
- Cache "last good" tree
- Provider: O(1) context lookup + small set assembly; honor cancellation

## Snippet Completions

```
module ${1:name}(${2:params}) {\n\t$0\n}
function ${1:name}(${2:params}) = ${0:expr};
translate([$1, $2, $3]) $0;
color("$1") $0;
```

## Error Handling

- Treat Tree-sitter `ERROR` nodes normally; walk up until stable parent
- Never throw from provider; return `suggestions: []` when uncertain
- If cross-file resolution fails, degrade to local + built-in

## Edge Cases

- Suppress non-relevant completions inside comments
- Inside strings: only show string-relevant completions (colors, file paths)
- Nested calls: prefer innermost call expression containing cursor

## Testing Strategy

- Unit: cursor-to-context detection with `|` cursor marker fixtures; symbol extraction; ranking determinism
- Integration: Monaco model assertions for key scenarios (translate/$fn/color/vars/imported)

## UX

- Auto-trigger on minimal set (`$`, `(`, `,`, `=`, `[`, `"`) with tight context gating
- Everything else via Ctrl+Space
- `detail` shows signature; `documentation` shows short docs + examples
