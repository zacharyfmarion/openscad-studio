# Phase 7 — Editor Intelligence Implementation Plan

## Overview

Build a single shared "OpenSCAD language service" around the existing Tree-sitter parse: it produces an indexed symbol table + diagnostics, and Monaco consumes it via Definition/Hover/Completion providers and markers. Keep static analysis intentionally conservative to avoid false positives given OpenSCAD's dynamic patterns.

**Effort estimate:** Large (3d+) overall (shared infra + multi-file + robust scope/type heuristics).

---

# Shared Infrastructure

## Core: `OpenScadLanguageService`

- Parse OpenSCAD text → Tree-sitter AST (incremental updates)
- Build and cache: symbol table, signatures, diagnostics, docstrings
- Resolve files for `use`/`include`, maintain cross-file indexes

### Module layout

```
editor-intel/
  languageService.ts
  astCache.ts
  fileResolver.ts
  indexer/ (symbol indexing + scope building)
  lint/ (rules + engine)
  providers/ (Monaco adapters)
  builtins/ (docs + signatures JSON)
```

## Symbol Table

- `SymbolDef`: name, kind (module/function/variable/parameter/builtin/special), location, signature?, doc?
- `SymbolRef`: name, kindHint, location
- `Scope`: id, parentId, range, `defs: Map<string, SymbolDef[]>`
- `Index`: scopesByDoc, globalDefsByName, refsByDoc, importsByDoc

### Core queries

- `findDefinitionAt(docId, position)`
- `findSymbolsInScope(docId, position)`
- `getHoverInfoAt(docId, position)`
- `getLintDiagnostics(docId)`

## AST Caching

- Incremental Tree-sitter parsing from Monaco change events
- Cache per model: text version, Tree-sitter tree, computed index
- Re-index only changed document; re-index dependents when import graph changes

## File Resolution

- `resolvePath(fromDocId, relativePath) → ResolvedDocId | null`
- `readText(resolvedDocId) → string | null`
- Desktop: real FS; Web: virtual FS adapters

---

# 7.1 Static Linting

## Lint Rules

### A. Undefined variable references

- Warn when identifier can't resolve to local/global var, parameter, special var, or builtin
- Special vars allowlist: `$fn`, `$fa`, `$fs`, `$t`, `$vpr`, `$vpt`, `$vpd`, `$preview`, `$children`
- Downgrade to hint if from unresolved `include/use`

### B. Unused variable warnings

- Warn when assignment never referenced in effective scope
- Suppress for `_`-prefixed variables and top-level assignments in include-target files

### C. Module/function arity mismatches

- Validate call sites against known signatures: missing required params, too many args, unknown named params
- Emit hint (not warning) if definition unresolvable

### D. Deprecated function usage

- Versioned "deprecated list" in builtins DB (e.g., `assign()` → prefer `let()`)

### E. Type mismatches (best-effort)

- Minimal type lattice: Unknown, Number, Bool, String, Vector(n), List, Color, Range
- Warn only when both argument type and callee expectation are confidently known
- Examples: `translate(1)` (expects vector), `sphere(r=[1,2,3])` (expects number)

### F. Missing semicolons

- Detect via Tree-sitter ERROR nodes or missing `;` tokens

## Architecture

- Single-pass scope + definition + reference building; optional second pass for cross-references
- Debounced on idle (150–300ms after last edit)
- Separate Monaco marker owner: `openscad-lint` (alongside existing `openscad-compile`)

## Scope Analysis

- Scope boundaries: file, module, function, `let()`, loop/comprehension, block
- Definition sites: `module name(){}`, `function name()=`, `x = expr;`
- Reference classification: call position vs value position vs named-arg key

## False Positive Mitigation

- "Warn only when confident" strategy
- Unresolved includes → hint at most
- Conditional definitions → index both branches, lower severity
- Suppression: `// osl-lint-disable OSL001` (line) / block comments

---

# 7.2 Go-to-Definition

## Symbol Resolution

- Modules: `module foo() {}`
- Functions: `function foo(a,b) = ...`
- Variables: `x = 10;`
- Cross-file: `use`/`include` resolution (search scope chain → use exports → include scopes)
- Multiple defs: prefer current file + closest lexical scope

## Monaco Integration

- `registerDefinitionProvider("openscad", provider)` returning `Definition | LocationLink[]`

## Cross-file Navigation

- Desktop: open file in new tab → `revealLineInCenter` → `setPosition` → focus
- Web: VFS-based with stable URIs

## Edge Cases

- Multiple/overloaded definitions: pick nearest scope
- Built-in functions: return null (hover shows docs instead)
- Undefined symbols: return null (lint warns)

---

# 7.3 Hover Documentation

## Built-in Documentation Database

JSON checked into repo (`builtins/openscad-vYYYY.MM.json`):

```json
{
  "name": "cube",
  "kind": "module",
  "signature": "cube(size = [1,1,1], center = false)",
  "params": [{ "name": "size", "type": "Number|Vector(3)", "desc": "..." }],
  "examples": ["cube(10);", "cube([10,20,30], center=true);"],
  "doc": "Creates an axis-aligned cube/cuboid."
}
```

## User-defined Symbol Hover

- Module/function: show signature + parameters + defaults
- Variables: show truncated initializer or inferred type
- Doc comments: nearest preceding `//` block or `/** */` above definition

## Monaco Integration

- `registerHoverProvider("openscad", provider)` returning markdown `{ contents: [{ value: markdown }] }`

---

# 7.4 Improved Autocomplete

## Context-Aware Completions

- Inside `translate([|])` → coordinate pattern snippets
- After `$fn = |` → common values (6, 12, 24, 48, 96)
- Inside `color("|")` → named colors with `CompletionItem.kind = Color`
- Inside `foo(|)` → parameter names from resolved signature

## Symbol Completions

- Modules/functions visible in current file + imported via `use`
- Variables/parameters in current scope chain
- Special variables always available

## Ranking

Score = baseKindWeight + scopeProximity + usageFrequency + recencyBoost − deprecationPenalty

- Parameters > locals > modules/functions > globals > builtins

## Monaco Integration

- `registerCompletionItemProvider("openscad", { triggerCharacters: ['(', '[', ',', '=', '$', '"'] })`
- Snippets for common patterns: `[${1:x}, ${2:y}, ${3:z}]`

---

# Combined Implementation Steps

1. **Shared parsing + indexing baseline** (AST cache, file resolver, single-file symbol index)
2. **Go-to-Definition (single file)** (definition provider, scope resolution, shadowing)
3. **Hover (built-ins + user-defined, single file)** (builtins JSON, signature extraction)
4. **Autocomplete v2 (single file)** (scope-based symbols, parameter names, ranking)
5. **Multi-file graph** (use/include resolution, cross-file navigation, open tabs)
6. **Static linting** (conservative rules, dual-channel markers, debounce, suppression)
7. **Stabilization + tuning** (regression tests, benchmarks, false-positive reduction)
