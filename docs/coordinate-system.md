# Coordinate System in OpenSCAD Studio

This document explains how OpenSCAD's Z-up coordinate system maps to Three.js's Y-up system inside the 3D viewer, where the boundary lives, and which utilities to use when crossing it.

## OpenSCAD vs. Three.js conventions

| Convention | X | Y | Z |
|---|---|---|---|
| **OpenSCAD** | right | depth (forward) | up |
| **Three.js** | right | up | depth (toward viewer) |

OpenSCAD is Z-up; Three.js is Y-up. These are different coordinate spaces.

## How the mesh is transformed

The STL/mesh loaded into the scene is a child `<mesh>` with a fixed rotation:

```tsx
<mesh rotation={[-Math.PI / 2, 0, 0]}>
```

This single rotation on the mesh makes the model *look* correct. It maps OpenSCAD coordinates into Three.js world space as follows:

| OpenSCAD axis | Three.js world axis |
|---|---|
| X | X (unchanged) |
| Y | −Z |
| Z | Y |

Equivalently:

- Three.js world **(x, y, z)** → OpenSCAD **(x, −z, y)**
- OpenSCAD **(x, y, z)** → Three.js world **(x, z, −y)**

## The `coordinateTransform.ts` helpers

`apps/ui/src/services/coordinateTransform.ts` is the single source of truth for crossing this boundary:

```ts
// For signed delta vectors (e.g. measurement deltas)
threeToOpenScadDelta(v: THREE.Vector3): THREE.Vector3
// → new Vector3(v.x, -v.z, v.y)

// For size vectors (always positive, just reorder axes)
threeToOpenScadSize(size: THREE.Vector3): THREE.Vector3
// → new Vector3(size.x, size.z, size.y)
// (Three.js x=X, y=Z, z=Y  →  OpenSCAD x=X, y=Y, z=Z)
```

Use `threeToOpenScadSize` when displaying bounding-box dimensions. Use `threeToOpenScadDelta` when displaying a signed distance or displacement.

## Where each layer lives

| File | Space | Notes |
|---|---|---|
| `ThreeViewer.tsx` mesh `rotation` | Internal Three.js ↔ OpenSCAD boundary | Do not change this rotation |
| `previewFraming.ts` | Three.js world space | Grid, framing, bounding-box math; correct as-is |
| `previewAxes.ts` | Three.js world space (geometry) / OpenSCAD (tick labels) | Tick label *values* are converted; axis line positions are not |
| `BBoxPanel.tsx` | OpenSCAD display space | Uses `threeToOpenScadSize` before rendering |
| `ThreeViewer.tsx` `BBoxOverlay` | Three.js world space (HTML positions) / OpenSCAD (badge text) | Badge text remapped: Three.js Y face → "Z", Three.js Z face → "Y" |
| `SectionPlanePanel.tsx` | Three.js world space (axis values) / OpenSCAD (labels) | `value: 'y'` is Three.js Y = OpenSCAD Z, displayed as "Z" |
| `sectionPlaneController.ts` | Three.js world space | No display; correct as-is |
| `measurementController3d.ts` | Three.js world space | Apply `threeToOpenScadDelta` before displaying measurements |

## Axis overlay tick labels

The `previewAxes.ts` overlay draws lines in Three.js world space but displays tick *values* in OpenSCAD space:

- **X axis** (Three.js X = OpenSCAD X): tick values are unchanged.
- **Y axis** (Three.js Z = OpenSCAD −Y): tick values are negated so positive numbers appear in the OpenSCAD +Y direction (away from the camera in the default view).
- **Z axis** (Three.js Y = OpenSCAD Z): tick values are unchanged.

The axis *name* labels ("X", "Y", "Z") are placed at the positive end of each OpenSCAD axis:
- "X" → Three.js +X
- "Y" → Three.js **−Z** (= OpenSCAD +Y)
- "Z" → Three.js +Y

## Section plane axis mapping

The `SectionAxis` type (`'x' | 'y' | 'z'`) uses Three.js axis names internally. The UI remaps them for display:

| `SectionAxis` value | Three.js axis | OpenSCAD axis | Displayed label |
|---|---|---|---|
| `'x'` | X | X | X |
| `'y'` | Y | Z | Z |
| `'z'` | Z | Y | Y |

## What does NOT need conversion

- Geometry positions and sizes used internally (framing, raycasting, physics) — stay in Three.js space.
- The mesh rotation itself — do not change `[-Math.PI / 2, 0, 0]`.
- Section plane offset values — they are in Three.js world space and feed directly into shader uniforms.
