/**
 * Builds the transferable payload the preview mesh worker sends back to the
 * main thread: parsed mesh buffers plus a serialized BVH per large group.
 * Kept separate from the worker entry point so it can be unit tested.
 */

import * as THREE from 'three';
import { MeshBVH, type MeshBVHOptions } from 'three-mesh-bvh';
import { parseOffMesh, type OffRgba, type ParsedOffMesh } from './offMeshParser';

/** Groups smaller than this raycast fast enough without acceleration. */
export const BVH_MIN_TRIANGLES = 1500;

export interface SerializedMeshBvh {
  roots: ArrayBuffer[];
  indirectBuffer: Uint32Array | Uint16Array | null;
}

export interface PreviewMeshPayload {
  mesh: ParsedOffMesh;
  /** One entry per mesh group; null when the group is too small to need a BVH. */
  bvh: Array<SerializedMeshBvh | null>;
  /** Time spent on each stage, for the perf probe. */
  timings: { parseMs: number; bvhMs: number };
}

export function buildPreviewMeshPayload(
  bytes: Uint8Array,
  fallbackColor: OffRgba
): { payload: PreviewMeshPayload; transfer: ArrayBuffer[] } {
  const startedAt = performance.now();
  const mesh = parseOffMesh(bytes, fallbackColor);
  const parsedAt = performance.now();
  const transfer: ArrayBuffer[] = [];

  const bvh = mesh.groups.map((group) => {
    transfer.push(group.positions.buffer as ArrayBuffer, group.normals.buffer as ArrayBuffer);
    if (group.positions.length / 9 < BVH_MIN_TRIANGLES) {
      return null;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(group.positions, 3));
    // `indirect` keeps the render geometry non-indexed and untouched; the BVH
    // carries its own triangle ordering.
    // (three-mesh-bvh's bundled typings predate the `indirect` option.)
    const tree = new MeshBVH(geometry, { indirect: true } as MeshBVHOptions);
    const serialized = MeshBVH.serialize(tree, { cloneBuffers: false }) as unknown as {
      roots: ArrayBuffer[];
      indirectBuffer?: Uint32Array | Uint16Array | null;
    };
    const roots = serialized.roots;
    const indirectBuffer = serialized.indirectBuffer ?? null;
    transfer.push(...roots);
    if (indirectBuffer) {
      transfer.push(indirectBuffer.buffer as ArrayBuffer);
    }
    return { roots, indirectBuffer };
  });

  return {
    payload: {
      mesh,
      bvh,
      timings: { parseMs: parsedAt - startedAt, bvhMs: performance.now() - parsedAt },
    },
    transfer,
  };
}
