# Phase 7.2: Go-to-Definition

## Summary

Implement Go-to-Definition as a **symbol index + resolver** service powered by Tree-sitter, wired into Monaco via `DefinitionProvider` plus a custom editor opener that routes cross-file jumps through the existing tab manager.

## Effort Estimate

Medium (1–2d) if Tree-sitter is already integrated; Large (3d+) for robust scope handling + web VFS parity + E2E.

## Action Plan

1. Create a `GoToDefinitionService` that takes `(uri, position)` and returns `LocationLink[] | null`.
2. Add Tree-sitter symbol extraction (modules, functions, variables + scope) producing a per-file `SymbolIndex`.
3. Implement resolution order: current file → `include` files → `use` files (modules/functions only), with cycle protection.
4. Register Monaco providers: `registerDefinitionProvider` (F12/Cmd+Click) and `registerHoverProvider` (hint when resolvable).
5. Implement cross-file opening via `monaco.editor.registerEditorOpener` to open target URIs in tabs and reveal range.
6. Add navigation history (back/forward across tabs) + keybindings (Cmd+- and Shift+Cmd+-).
7. Harden: builtin filtering, library read-only handling, caching/perf budget, and tests.

## Monaco DefinitionProvider API

- Register: `monaco.languages.registerDefinitionProvider('openscad', { provideDefinition(model, position, token) })`
- Return `LocationLink[]` (preferred for better UX):
  - `originSelectionRange` (what user clicked)
  - `targetUri`
  - `targetRange` (full definition node)
  - `targetSelectionRange` (just the identifier)

## Symbol Resolution (Current File)

- Use Tree-sitter to identify identifier under cursor and its context (module instantiation vs function call vs plain identifier)
- Build `SymbolIndex` per file: `modules: Map<string, DefinitionSite[]>`, `functions: Map<string, DefinitionSite[]>`

## Cross-File Resolution

- Reuse Phase 4C include/use resolver for canonical URIs
- Search order: current file → `include` targets → `use` targets (modules/functions only, not variables)
- Add `visited: Set<uri>` for cycle prevention

## Tree-sitter Usage

- Parse open files from `model.getValue()`, cache by `model.getVersionId()`
- Parse non-open files via PlatformBridge, cache by `(uri, contentHash)`
- Convert Monaco position (1-based) → Tree-sitter point (0-based)
- Use `tree.rootNode.descendantForPosition(point)` and walk up to nearest identifier

## Tab Opening (Cross-File Jumps)

- Register Monaco opener hook so built-in Go to Definition triggers app tab logic
- Inside: `tabManager.open(resource)` → wait for model → apply selection + `revealRangeInCenter`

## Position Tracking

- Tree-sitter gives `node.startPosition/endPosition` (0-based row/column)
- Convert to Monaco `Range`: `startLineNumber = row + 1`, `startColumn = column + 1`
- Store `targetRange` (full definition node) and `targetSelectionRange` (identifier token)

## Built-in Recognition

- `builtinSymbols: Set<string>` for built-in modules (`cube`, `sphere`, `translate`, ...), functions (`sin`, `cos`, ...), and special variables (`$fn`, `$fa`, ...)
- If identifier matches builtin → return `null`

## Variable Definitions

- Support: `x = expr;` assignments, module/function parameters, `let(x=...)` bindings, `for(i=...)` loop variables
- Scope rule: find nearest enclosing scope, prefer closest definition before reference, allow forward reference as fallback

## Library File Handling

- Detect library URIs via existing library path management
- Open in tab flagged `readOnly: true`
- Show "Library" / "Read-only" badge; disable Save

## Navigation Stack (Back/Forward)

- App-level history across tabs:
  - On jump: push `{fromUri, fromPosition, fromSelection}` onto `backStack`, clear `forwardStack`
  - Cmd+-: pop and reveal; Shift+Cmd+-: forward
- Don't rely solely on Monaco's internal navigation (editor-instance-scoped)

## Platform Differences

- Single abstraction: `FileProvider.readText(uri)`, `FileProvider.exists(uri)`, `FileProvider.isWritable(uri)`
- Desktop: PlatformBridge/Tauri FS
- Web: in-memory workspace; surface "not available in web mode" for disk includes

## Performance

- Cache layers: `ParseCache` (uri → tree) and `IndexCache` (uri → symbolIndex)
- On-demand parse/index on F12/Cmd+Click (fast path)
- Optional: debounce re-index on model content change for hover responsiveness
- Honor cancellation token

## Error Handling

- Symbol not found: return `null`; optionally show toast only on explicit F12
- File not found: return `null` + clear message
- Parse errors: proceed with partial tree; fall back to "no definition"

## Edge Cases

- Multiple definitions (redefinition / same name in multiple includes): return array of `LocationLink`s; Monaco shows peek/chooser
- Dynamic include paths: mark as unresolvable, skip
- Forward references: modules/functions allowed anywhere; variables prefer nearest in scope

## Testing Strategy

- Unit: Tree-sitter extraction given text → `SymbolIndex` + ranges; resolver given file graph → correct target; builtin filtering
- Integration: fixture workspace with `main.scad` + `use/include` targets; verify definition location
- E2E (optional): Playwright — Cmd+Click/F12, verify tab opened and cursor moved; verify Cmd+- returns

## UX (Hover Hint)

- Register `HoverProvider` using same resolver
- Show "Go to definition (F12)" / "Cmd+Click to open definition" only when resolvable
