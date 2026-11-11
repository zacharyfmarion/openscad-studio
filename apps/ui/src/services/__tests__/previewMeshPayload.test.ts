/** @jest-environment jsdom */

import * as THREE from 'three';
import { buildPreviewMeshPayload, BVH_MIN_TRIANGLES } from '../previewMeshPayload';
import {
  buildPreview3dObject,
  createPreview3dModelFromMesh,
  loadOffPreviewModelFromUrl,
} from '../preview3dModel';
import { FALLBACK_PREVIEW_SCENE_STYLE } from '../previewSceneConfig';

function encode(content: string) {
  const bytes = new Uint8Array(content.length);
  for (let i = 0; i < content.length; i += 1) {
    bytes[i] = content.charCodeAt(i);
  }
  return bytes;
}

/** A UV sphere with shared vertices, written the way OpenSCAD writes OFF. */
function sphereOff(radius: number, segments: number, color = '') {
  const vertices: string[] = [];
  const faces: string[] = [];
  const rings = segments / 2;
  vertices.push(`0 0 ${radius}`);
  for (let ring = 1; ring < rings; ring += 1) {
    const phi = (ring / rings) * Math.PI;
    for (let segment = 0; segment < segments; segment += 1) {
      const theta = (segment / segments) * Math.PI * 2;
      vertices.push(
        `${radius * Math.sin(phi) * Math.cos(theta)} ${radius * Math.sin(phi) * Math.sin(theta)} ${radius * Math.cos(phi)}`
      );
    }
  }
  vertices.push(`0 0 ${-radius}`);
  const south = vertices.length - 1;
  const at = (ring: number, segment: number) => 1 + (ring - 1) * segments + (segment % segments);

  for (let segment = 0; segment < segments; segment += 1) {
    faces.push(`3 0 ${at(1, segment)} ${at(1, segment + 1)}${color}`);
    faces.push(`3 ${south} ${at(rings - 1, segment + 1)} ${at(rings - 1, segment)}${color}`);
  }
  for (let ring = 1; ring < rings - 1; ring += 1) {
    for (let segment = 0; segment < segments; segment += 1) {
      faces.push(
        `4 ${at(ring, segment)} ${at(ring + 1, segment)} ${at(ring + 1, segment + 1)} ${at(ring, segment + 1)}${color}`
      );
    }
  }

  return `OFF ${vertices.length} ${faces.length} 0\n${vertices.join('\n')}\n${faces.join('\n')}\n`;
}

describe('buildPreviewMeshPayload', () => {
  it('only builds a BVH for groups that are large enough to need one', () => {
    const small = buildPreviewMeshPayload(encode(sphereOff(10, 8)), [0.5, 0.5, 0.5, 1]);
    expect(small.payload.mesh.triangleCount).toBeLessThan(BVH_MIN_TRIANGLES);
    expect(small.payload.bvh).toEqual([null]);

    const large = buildPreviewMeshPayload(encode(sphereOff(10, 64)), [0.5, 0.5, 0.5, 1]);
    expect(large.payload.mesh.triangleCount).toBeGreaterThanOrEqual(BVH_MIN_TRIANGLES);
    expect(large.payload.bvh[0]?.roots.length).toBeGreaterThan(0);
    // Everything large must be transferable rather than structured-cloned.
    expect(large.transfer).toEqual(
      expect.arrayContaining([
        large.payload.mesh.groups[0].positions.buffer,
        large.payload.mesh.groups[0].normals.buffer,
        ...large.payload.bvh[0]!.roots,
      ])
    );
  });

  it('produces a BVH whose raycasts match brute-force raycasts', () => {
    const off = encode(sphereOff(25, 96));
    const { payload } = buildPreviewMeshPayload(off, [0.5, 0.5, 0.5, 1]);

    const accelerated = buildPreview3dObject({
      parsed: createPreview3dModelFromMesh(payload.mesh, 'bvh', payload.bvh),
      sceneStyle: FALLBACK_PREVIEW_SCENE_STYLE,
    });
    const bruteForce = buildPreview3dObject({
      parsed: createPreview3dModelFromMesh(payload.mesh, 'plain'),
      sceneStyle: FALLBACK_PREVIEW_SCENE_STYLE,
    });

    expect(accelerated.meshes[0].geometry.boundsTree).toBeDefined();
    expect(accelerated.meshes[0].geometry.index).toBeNull();
    expect(bruteForce.meshes[0].geometry.boundsTree).toBeUndefined();

    const fast = new THREE.Raycaster();
    fast.firstHitOnly = true;
    const slow = new THREE.Raycaster();
    let hits = 0;

    for (let i = 0; i < 200; i += 1) {
      const origin = new THREE.Vector3(
        Math.sin(i * 1.3) * 80,
        Math.cos(i * 0.7) * 80,
        Math.sin(i * 0.37) * 80
      );
      // Aim near the sphere so most rays hit and some graze or miss.
      const target = new THREE.Vector3(
        Math.sin(i * 2.1) * 24,
        Math.cos(i * 1.9) * 24,
        Math.sin(i * 0.9) * 24
      );
      const direction = target.sub(origin).normalize();
      fast.set(origin, direction);
      slow.set(origin, direction);

      const fastHit = fast.intersectObject(accelerated.root, true)[0];
      const slowHit = slow.intersectObject(bruteForce.root, true)[0];

      expect(Boolean(fastHit)).toBe(Boolean(slowHit));
      if (fastHit && slowHit) {
        hits += 1;
        expect(fastHit.distance).toBeCloseTo(slowHit.distance, 4);
        expect(fastHit.faceIndex).toBe(slowHit.faceIndex);
        expect(fastHit.face?.a).toBe(slowHit.face?.a);
        expect(fastHit.face?.normal.distanceTo(slowHit.face!.normal)).toBeLessThan(1e-5);
      }
    }

    expect(hits).toBeGreaterThan(100);
  });
});

describe('loadOffPreviewModelFromUrl', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('parses on the main thread when Web Workers are unavailable', async () => {
    // Large enough to prefer the worker path; jsdom has no Worker.
    const bytes = encode(sphereOff(25, 192, ' 255 0 0'));
    expect(bytes.length).toBeGreaterThan(512 * 1024);
    globalThis.fetch = (async () => ({
      ok: true,
      arrayBuffer: async () => bytes.buffer.slice(0),
    })) as unknown as typeof fetch;

    const model = await loadOffPreviewModelFromUrl({
      url: 'blob:test',
      fallbackColor: '#ffffff',
      version: 'v1',
    });

    expect(model.groups).toHaveLength(1);
    expect(model.groups[0].color.getHexString()).toBe('ff0000');
    expect(model.groups[0].geometry.boundsTree).toBeUndefined();
    expect(model.frame.version).toBe('v1');
    expect(model.frame.maxDim).toBeCloseTo(50, 3);

    model.dispose();
  });
});
