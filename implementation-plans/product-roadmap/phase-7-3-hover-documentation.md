# Phase 7.3: Hover Documentation

## Summary

Implement hover docs as a **purely local, cached** lookup: embedded JSON for built-ins + a lightweight **symbol index** (Tree-sitter) for user-defined modules/functions/vars, surfaced through a single Monaco `HoverProvider`.

## Effort Estimate

Medium (1–2d) for built-ins + same-file modules/functions; Large (3d+) for robust multi-file + variable inference.

## Action Plan

1. Define embedded built-in docs JSON schema and add initial coverage (primitives/transforms/booleans/math + special vars).
2. Build a per-model symbol index (modules/functions/assignments + ranges) updated on content change with debounce.
3. Register Monaco `HoverProvider` for `openscad` that resolves word at cursor, filters comments/strings, returns markdown + precise range.
4. Implement built-in detection and doc rendering (signature → params → example) from embedded JSON.
5. Implement user-defined module/function hover from symbol index (signature + defaults) and best-effort variable hover.
6. Add multi-file symbol merging using already-loaded Monaco models; annotate origin URI when available.
7. Add unit + snapshot tests for doc lookup/formatting and symbol extraction.

## Documentation Data Format (JSON Schema)

```json
{
  "version": "string",
  "openscadVersion": "string",
  "builtins": [
    {
      "name": "string",
      "kind": "module | function | special-var",
      "category": "primitives | transforms | booleans | extrusion | text | io | math | list | string | debug | rendering | special-vars",
      "summary": "string",
      "signature": "string",
      "params": [
        {
          "name": "string",
          "type": "string",
          "default": "string",
          "optional": "boolean",
          "description": "string"
        }
      ],
      "returns": "string",
      "descriptionMd": "string",
      "exampleScad": "string",
      "notesMd": "string",
      "seeAlso": ["string"],
      "url": "string",
      "since": "string",
      "deprecated": "boolean"
    }
  ]
}
```

### Example Entry (cube)

```json
{
  "name": "cube",
  "kind": "module",
  "category": "primitives",
  "summary": "Creates a cube or rectangular prism.",
  "signature": "cube(size = [x, y, z] | s, center = false);",
  "params": [
    {
      "name": "size",
      "type": "number|vector3",
      "default": "1",
      "description": "Edge length or [x,y,z] dimensions."
    },
    {
      "name": "center",
      "type": "bool",
      "default": "false",
      "description": "If true, center at origin."
    }
  ],
  "exampleScad": "cube([10, 20, 5], center=true);",
  "seeAlso": ["sphere", "cylinder"]
}
```

## Built-in Coverage

- **Primitives:** `cube`, `sphere`, `cylinder`, `polyhedron`, `square`, `circle`, `polygon`
- **Text/2D:** `text`, `offset`
- **Transforms:** `translate`, `rotate`, `scale`, `resize`, `mirror`, `multmatrix`, `color`, `render`, `projection`
- **Extrusion:** `linear_extrude`, `rotate_extrude`
- **Booleans/CSG:** `union`, `difference`, `intersection`, `hull`, `minkowski`
- **Debug:** `echo`, `assert`
- **Math:** `sin`, `cos`, `tan`, `asin`, `acos`, `atan`, `atan2`, `abs`, `min`, `max`, `pow`, `sqrt`, `round`, `floor`, `ceil`, `exp`, `ln`, `log`, `sign`
- **List/vector:** `len`, `concat`, `search`, `lookup`, `rands`, `cross`, `norm`
- **String:** `str`, `chr`, `ord`
- **I/O:** `import`, `surface`
- **Special vars:** `$fn`, `$fa`, `$fs`, `$t`, `$vpr`, `$vpt`, `$vpd`, `$preview`, `$children`

## Monaco HoverProvider API

```ts
monaco.languages.registerHoverProvider('openscad', {
  provideHover(model, position, token) {
    // return { range, contents: IMarkdownString[] } or null
  },
});
```

## Built-in Detection

1. `model.getWordAtPosition(position)` to find token
2. Reject comments/strings via Monaco tokenization
3. Prefer user-defined symbols over built-ins (if same name)
4. Optional: confirm "call-ish" context (next non-whitespace char is `(`)

## User-Defined Module Hover

- Parse buffer to AST on content change (debounced)
- Extract module definitions, function definitions, assignments
- Build index: `name`, `kind`, `signatureText`, `params[]`, `range`, `originUri`
- Hover content: `module foo(a=1, b) …` or `function bar(x, y=2) = …`

## Markdown Rendering Template

````markdown
**cube** — Creates a cube or rectangular prism.

`cube(size = ..., center = false);`

**Parameters**

- `size` (number | [x,y,z]) — Edge length or dimensions.
- `center` (bool, default: `false`) — Center at origin.

**Example**

```scad
translate([0,0,5]) cube([10,20,10], center=true);
```
````

```

## Variable Hover
- Show last assignment expression text in same file/scope
- Best-effort type from literal form: `123` → number, `"abc"` → string, `[1,2,3]` → vector, `true/false` → bool
- Do NOT attempt full expression evaluation

## Special Variables
- Model as `kind: "special-var"` entries in the same JSON
- `$fn`, `$fa`, `$fs`, `$t`, `$vpr`, `$vpt`, `$vpd`, `$preview`, `$children`
- Detection: identifier begins with `$` and matches docs table

## Performance
- Embed JSON at build time (static import) — O(1) lookup
- Per-model cache: `builtinDocsByName: Map`, `symbolIndexByModelUri: { modules, functions, vars, lastUpdatedVersion }`
- Parsing/indexing on change, not on hover

## Error Handling
- `getWordAtPosition` null → return null
- Token is comment/string → return null
- Identifier not found in user index nor built-ins → return null
- Wrap provider in try/catch, fail closed (return null)

## Edge Cases
- Suppress hover in comments, strings, numeric literals
- Shadowing: if user defines `module cube(){}` prefer user-defined over built-in

## Multi-File
- When Monaco model created/opened, parse and add exports to workspace symbol table
- If `use/include` target is loaded, merge symbols and annotate `originUri`
- If not loaded, show "Defined in: <path> (not indexed)" or skip

## Testing Strategy
- Unit: doc lookup built-in name → markdown blocks; formatting snapshot for representative built-ins
- Symbol extraction: given SCAD snippet → extracted signature + defaults
- Integration: mock Monaco `model` methods, assert returned `range`/`contents`

## Maintenance
- `openscadVersion` in dataset; bump intentionally
- Coverage test that fails if required built-ins are missing
- Keep doc strings short; link to official docs via `url`
```
