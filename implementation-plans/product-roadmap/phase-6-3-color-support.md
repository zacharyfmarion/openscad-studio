# Phase 6.3: Color Support from OpenSCAD

## Summary

Ship as **source-parsed, single-color override** (first `color()` call → one Three.js material), because it's low-risk and doesn't require changing the render/loader pipeline. For true multi-color, **prefer switching preview to 3MF (or AMF)** and letting OpenSCAD embed colors.

## Effort Estimate

Short (1–4h) for MVP single-color override; Medium (1–2d) for 3MF multi-color

## Action Plan

1. Add a tiny `extractFirstScadColor(source)` utility that strips comments/strings, finds the first `color(...)`, and parses only constant forms (string, `[r,g,b]`, `[r,g,b,a]`, optional `alpha=`).
2. Extend `useOpenScad` to compute `previewColor` (and optional `previewOpacity`) from the current `source`, independent of rendering/caching.
3. Thread `previewColor` into `Preview → ThreeViewer` (and `offscreenRenderer.captureOffscreen`) as an override for the current theme-derived color.
4. In `ThreeViewer`, apply `meshStandardMaterial` with `color`, and set `transparent/opacity` when alpha < 1.
5. Add Jest unit tests for parsing and visual smoke fixtures.
6. Prototype multi-color as a follow-up: add optional preview mesh format (`stl` vs `3mf`) and evaluate `3MFLoader` behavior.

## Approach Evaluation — AMF/3MF vs Source Parsing

- **Source parsing (apply color in Three.js)**: Great for MVP (single material), no renderer changes, instant updates on edits; but **cannot** accurately map multiple `color()` regions onto triangles in a single STL mesh.
- **3MF/AMF preview (colors embedded by OpenSCAD)**: Best path for multi-color fidelity; costs are loader complexity, larger files, and platform consistency.

## Three.js Loader Availability

- With `three@^0.171.0` and `three-stdlib@^2.36.0`, Three's examples include `3MFLoader` and `AMFLoader`.
- **3MF is the better-maintained path** (widely used in printing workflows, zipped container).

## OpenSCAD `color()` Syntax — Valid Forms

- `color("red") { ... }` (named color string)
- `color("#ff00ff") { ... }` (hex string)
- `color([r,g,b]) { ... }` (floats 0..1)
- `color([r,g,b,a]) { ... }` (alpha in vector)
- `color([r,g,b], a) { ... }` (separate alpha argument)
- `color(c=[...], alpha=0.5) { ... }` (named args)

For MVP: support string + vector + optional alpha (positional or `alpha=`); ignore expressions/variables.

## Source Parsing Strategy

- **MVP**: regex + lightweight scanning (strip comments/strings first, then search) — reuse approach from `includeParser.ts`.
- **AST (tree-sitter)**: preferable long-term, and you already ship `tree-sitter-openscad`.
- **Critical point**: Even with AST, mapping multiple `color()` calls to STL triangles is not reliable without extra information from the exporter.

## Minimum Viable — Single Color Override

- Implement `extractFirstScadColor()` returning `{ color: string | {r,g,b}, opacity?: number } | null`.
- Compute `previewColor` from `source` on change; **do not** tie to render output or cache state.

## Multi-Color (Follow-on)

Primary recommendation: **use 3MF preview** for multi-color.
Staying on STL would require multi-pass rendering of isolated colored subtrees — complex and fragile.

## Material System

- **MVP**: single `MeshStandardMaterial` on the whole mesh (match wireframe overlay to same color).
- **Multi-color (3MF/AMF)**: loaders produce multiple meshes or `geometry.groups` + `material[]`; normalize to `MeshStandardMaterial`.

## Render Format Changes

- Introduce `RenderOptions.meshFormat?: 'stl' | '3mf' | 'amf'`
- Update viewer pipeline to load based on `meshFormat`

## Platform Differences

- Desktop OpenSCAD CLI generally supports `-o out.3mf` / `out.amf`.
- Web depends on what `openscad-wasm` includes.
- Keep MVP format-agnostic (still STL); gate 3MF preview behind runtime probe.

## Cache Implications

- MVP parsing does not require cache invalidation (color is derived from code at display time).
- If you add `meshFormat`, it **must** be included in the cache key.

## Performance

- Parsing first `color()` is negligible.
- 3MF is larger and requires decompression + XML parsing — higher overhead than STL.

## Fallback Behavior

- If parsing fails or yields non-constant expression → fall back to theme-based model color.
- Invalid alpha → clamp and default to opaque.

## Edge Cases

- **Nested `color()`**: MVP uses "first occurrence wins"
- **Modules/conditionals**: static parsing may see colors not executed; MVP accepts that
- **No `color()` calls**: keep current theme-derived color

## Testing Strategy

- Unit tests for `extractFirstScadColor()`: comments, block comments, strings containing `color(`, named colors, hex strings, `[r,g,b]`, `[r,g,b,a]`, `alpha=`
- Visual verification via sample `.scad` snippets

## UX

- No settings: color should automatically affect the preview when users type `color(...)`.
- Predictable: MVP = single override; multi-color only with 3MF/AMF format support.
