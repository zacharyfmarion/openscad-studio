# Phase 7.1: Static Linting

## Summary

Implement linting as a **pure in-renderer Tree-sitter analysis pass** that produces Monaco warning markers under a separate "lint" owner, scheduled **on idle/debounced** and cancelable on edits. Start with **single-file correctness + conservative rules**, then add **include/use graph + cross-file symbol indexing**.

## Effort Estimate

Large (3d+) for multi-file + robust scoping; Medium (1–2d) for single-file with conservative rules.

## Action Plan

1. Verify/reuse Tree-sitter formatting infra (grammar + WASM loader); if missing, add minimal `web-tree-sitter` pipeline.
2. Build a lint engine: parse → build symbol/scope index → run registered rules → emit `LintDiagnostic[]` with stable rule IDs.
3. Implement OpenSCAD scope model (global/module/function/let/for) and resolver distinguishing variable vs function vs module namespaces.
4. Add rules: undefined var, unused var, module arity/name checks, deprecated builtins — each using shared indexes.
5. Integrate with Monaco: set markers via `openscad-lint` owner, keep compile stderr markers untouched; update DiagnosticsPanel to show merged lists.
6. Add idle debouncing + cancellation and performance budget; cache parse trees and indexes.
7. Implement multi-file linting via include/use dependency graph + cached per-file exports; add suppression comments + tests.

## AST Infrastructure

- Use WASM Tree-sitter initialized once per app session
- Bundle OpenSCAD grammar as `tree-sitter-openscad.wasm` under app assets
- Provide wrapper: `OpenScadParser.parse(text, previousTree?, edits?) -> Tree`
- Handle UTF-16 vs UTF-8 position mapping (Tree-sitter byte-based; Monaco UTF-16 column-based)

## Lint Rule Architecture

```ts
interface LintDiagnostic {
  ruleId: string;
  message: string;
  severity: Severity;
  range: Range;
  fileUri: string;
  related?: Location[];
  tags?: DiagnosticTag[];
}
interface LintContext {
  tree: Tree;
  text: string;
  uri: string;
  resolver: FileResolver;
  indexes: Indexes;
  settings: Settings;
  cancelToken: CancelToken;
}
interface LintRule {
  id: string;
  defaultSeverity: Severity;
  run(ctx: LintContext): LintDiagnostic[];
}
```

- Build shared indexes once: `ScopeIndex`, `SymbolIndex`, `CallIndex`, `DirectiveIndex`
- Rules are pure, fast, and honor cancellation
- Registry: single `lint/rules/index.ts`; per-rule enable/disable + severity override

## Scope Analysis (OpenSCAD Variable Scope)

- Model scopes as a tree: `Scope { parent?, kind, bindings, references }`
- Walk AST to create scopes at: Global (file), module body, function expression, `let(...)`, `for(...)`
- Treat modules and functions as separate namespaces from variables

## Lint Rules

### Undefined Variable Detection

- Collect identifier references in expression positions
- Resolve by walking parent scopes
- Check against built-in values (`undef`, `true`, `false`), special variables (`$fn`, `$fa`, `$fs`, `$t`, `$vpt`, `$vpr`, `$vpd`, `$preview`, `$children`), and built-in functions/modules
- Keep built-ins in `lint/builtins.ts`

### Unused Variable Detection

- Track module/function parameters, `let(a=...)` bindings, `for(i=...)` loop variables
- Count references in scope subtree; zero = unused
- `_`-prefixed names treated as intentionally unused
- Start with params + let/for; add global assignments once confident

### Module Arity Checking

- Index module definitions: track `requiredCount`, `totalCount`, `paramNames`
- Check call sites for: too many positional args, missing required args, unknown named args
- Include modules from `use/include` exports for cross-file arity checks

### Deprecated Function Detection

- Maintain `deprecatedBuiltins: Record<string, { message, since?, replacement? }>`
- Emit warning with actionable guidance

## Monaco Integration

- Separate marker owners: `openscad-compile` (existing) and `openscad-lint` (new)
- Convert `LintDiagnostic.range` to `monaco.IMarkerData`
- DiagnosticsPanel: merge lists with source badges and filtering (Compile vs Lint)

## Debouncing

- Debounce on model changes (300–600ms), run on `requestIdleCallback` with timeout fallback
- Store per-model `AbortController`; abort on keystroke/new schedule
- Target ~10–30ms single-file lint for typical files

## Multi-File Awareness

- Parse `include <path.scad>` (variables + modules/functions) and `use <path.scad>` (modules/functions only)
- Build dependency graph: `FileNode { uri, includes, uses, exports, lastParsedHash }`
- FileResolver abstraction: Desktop → Tauri FS; Web → workspace model
- Cache parse tree + exports per file; invalidate on content change; guard against cycles

## False Positive Management

- Conservative defaults: prefer "no warning" over wrong warning
- Suppression comments: `// lint-disable rule-id` (line-level)
- Start most rules as Warning; consider Info for unused vars initially

## Performance

- Incremental parsing: on Monaco change events, translate edits into `tree.edit(...)`, re-parse using previous tree
- Recompute indexes only when tree changes
- Multi-file throttle: limit depth/number of files per lint pass

## Error Handling

- Tree-sitter `ERROR` nodes: skip analysis inside malformed subtrees, still run lightweight checks outside
- If parser/grammar fails to load: disable linting gracefully with non-blocking banner

## Edge Cases

- Same identifier as var + module name: resolver uses AST context
- `$`-prefixed special variables and built-in modules
- Shadowing: let/for params shadow outer bindings; unused-var avoids flagging outer incorrectly

## Testing Strategy

- Unit tests per rule with fixtures: input `.scad` text → expected diagnostics snapshot
- Fixtures for: non-ASCII identifiers, partial/malformed code, include/use graphs + cycles
- Run in CI using same WASM grammar bundle

## Extensibility

- Keep rule API stable (`run(ctx) -> diagnostics`)
- Settings surface for enable/disable rules, severity overrides
- Optional later: "quick-fix" hooks (Monaco code actions) via `fix` metadata on diagnostics
