# 3D Viewer: Color Support, Measurement Tools, Special Operators — Implementation Plan

## Overview

Unify Color Support (6.3) and Special Operator Preview (6.5) by switching the 3D export pipeline from STL to **3MF** (when needed) and letting Three.js load per-part colors, while using Tree-sitter only to detect/preview-transform debug operators. Implement Measurement Tools (6.4) purely on the Three.js side (raycasting + overlay rendering).

**Effort estimate:** Medium (1–2d) for 6.3 + 6.4 baseline; Medium→Large (1–3d) for 6.5.

---

# Feature 6.3: Color Support from OpenSCAD

## 1) Format Evaluation

| Format  | Color Support            | Three.js Loader    | Recommendation                   |
| ------- | ------------------------ | ------------------ | -------------------------------- |
| STL     | None                     | STLLoader ✅       | Keep as fast monochrome fallback |
| AMF     | Per-object + alpha       | Inconsistent       | Not recommended                  |
| **3MF** | **Per-part + materials** | **3MFLoader ✅**   | **Primary colored format**       |
| OFF     | Vertex colors            | No standard loader | Not recommended                  |

**Decision:** Use **3MF** when color is needed; retain **STL** as default fast path for monochrome.

## 2) Implementation Path

**Recommended: Option A — Switch to 3MF export**

- openscad-wasm exports 3MF instead of STL when `color()` is detected
- Three.js 3MFLoader handles per-part colors automatically
- Correct for: nested colors, computed colors, module colors, color names (all resolved by OpenSCAD)

**Why not Option B (parse source → apply materials):**

- No reliable mapping from AST nodes → final mesh triangles after CSG
- Would produce incorrect visuals for anything beyond trivial scenes

## 3) Three.js Material Changes

- 3MFLoader returns a Group with multiple Mesh children
- Viewer: replace "single mesh" assumption with root Group traversal
- Vertex colors: detect `geometry.hasAttribute('color')` → `material.vertexColors = true`
- Transparency: alpha < 1 → `material.transparent = true`, `material.opacity = alpha`

## 4) Fallback

- No `color()` → continue STL export with default gray material
- 3MF meshes without explicit color → apply default viewer material

## 5) Edge Cases

- Nested/computed/module colors: handled by export (Option A)
- Alpha + sorting: transparent parts may need renderOrder tweaks

---

# Feature 6.4: Measurement Tools

## 1) Point-to-Point Distance

- **Picking**: `THREE.Raycaster` against root object
- **Vertex snapping**: Use `intersection.face.a/b/c` to find nearest vertex
- **Visuals**: endpoint markers (small spheres) + line + distance label at midpoint
- **Labels**: CSS2DRenderer (DOM overlay) or Sprite with canvas texture

## 2) Bounding Box Dimensions

- `Box3.setFromObject(rootObject)` → Box3Helper + dimension lines
- Labels: `X: 12.34`, `Y: 5.67`, `Z: 89.01` (units configurable later)

## 3) UI Design

- Toolbar: **Measure Distance** toggle, **Show Bounds** toggle, **Snap to Vertex** toggle, **Clear** button
- Precision: < 1 → 3 decimals, 1–100 → 2 decimals, > 100 → 1 decimal
- Multiple measurements simultaneously (Clear removes all)

## 4) Interaction Model

- Click-click for distance; toggle for bounds
- Orbit-friendly: treat as "click" only if pointer movement < 3–5px since pointerdown
- ESC or mode toggle off cancels partial measurement

## 5) Edge Cases

- Empty space click: ignore, keep waiting
- Very small/large models: auto-scale marker size relative to bounding box diagonal

---

# Feature 6.5: Special Operator Preview

## 1) Operator Detection (Tree-sitter)

- Parse current buffer for `#`, `%`, `*`, `!` prefix operators on statements/instantiations
- `detectSpecialOperators(ast) → { hasDebugOps, nodesByOperator }`

## 2) Rendering Strategy: Preview-only Source Transform

Build a derived "preview source" (never written to editor):

- `*` (disable): remove subtree entirely
- `!` (show only): keep only `!`-marked subtrees, remove `!` tokens, discard others
- `#` (highlight): wrap in `color([1.0, 0.5, 0.0, 0.6]) { ... }`
- `%` (background): wrap in `color([0.8, 0.8, 0.8, 0.15]) { ... }`

Export transformed source as **3MF** → viewer receives per-part colors/alpha.

## 3) Implementation Complexity

- Detection: Quick (Tree-sitter queries)
- Syntax-safe transforms: Short–Medium (must preserve valid OpenSCAD)
- Perfect OpenSCAD parity (nested `!`, operators in includes): Large

## 4) Edge Cases

- Nested operators: `*` removes first → `!` isolates at file scope → `#/%` coloring on remaining
- Operators on module invocations: support `#foo()` (common case)
- Included files: conservative fallback — if includes exist, default to 3MF

---

# Combined Implementation Steps

1. **3MF pipeline + viewer loading** (add 3MF export + 3MFLoader + Group handling)
2. **Material normalization + transparency** (vertex colors, alpha, default fallback)
3. **Measurement overlay system** (raycasting, vertex snapping, distance + bounds + labels + toolbar)
4. **Debug operator preview** (Tree-sitter detection + source transform + 3MF export)
5. **Quality + regression tests** (unit tests for transforms, smoke tests for loaders + measurements)
