import * as THREE from 'three';

/**
 * Convert a Three.js world-space delta vector to OpenSCAD coordinates.
 * The mesh is rotated [-π/2, 0, 0], so: ThreeJS(x,y,z) → OpenSCAD(x, -z, y)
 */
export function threeToOpenScadDelta(v: THREE.Vector3): THREE.Vector3 {
  return new THREE.Vector3(v.x, -v.z, v.y);
}

/**
 * Remap a Three.js size vector (always positive) to OpenSCAD axis order.
 * Three.js: x=width(OpenSCAD X), y=height(OpenSCAD Z), z=depth(OpenSCAD Y)
 */
export function threeToOpenScadSize(size: THREE.Vector3): THREE.Vector3 {
  return new THREE.Vector3(size.x, size.z, size.y);
}
