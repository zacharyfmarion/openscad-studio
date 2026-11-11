import * as THREE from 'three';
import { MeshBVH, acceleratedRaycast } from 'three-mesh-bvh';
import type { PreviewSceneStyle } from './previewSceneConfig';
import { buildModelFrameFromSourceBox, type ModelFrame } from './previewFraming';
import { perfMeasure, perfNow } from '../utils/perfProbe';
import { parseOffMesh, type OffRgba, type ParsedOffMesh } from './offMeshParser';
import type { SerializedMeshBvh } from './previewMeshPayload';
import {
  isPreviewMeshWorkerAvailable,
  parseOffMeshInWorker,
  PreviewMeshWorkerUnavailableError,
} from './previewMeshWorkerClient';

export interface PreviewMeshGroupData {
  key: string;
  geometry: THREE.BufferGeometry;
  color: THREE.Color;
  opacity: number;
  transparent: boolean;
}

export interface ParsedPreview3dModel {
  frame: ModelFrame;
  groups: PreviewMeshGroupData[];
  dispose: () => void;
}

export interface BuiltPreview3dObject {
  root: THREE.Group;
  meshes: THREE.Mesh[];
  dispose: () => void;
}

/**
 * OFF payloads above this size (roughly 15k triangles) are parsed and
 * BVH-indexed in a worker. Smaller ones parse in a few milliseconds, which is
 * cheaper than a worker round trip, and raycast quickly without a BVH.
 */
const WORKER_PARSE_MIN_BYTES = 512 * 1024;

function toOffRgba(fallbackColor: string): OffRgba {
  const fallback = new THREE.Color(fallbackColor);
  return [fallback.r, fallback.g, fallback.b, 1];
}

/** Wrap parsed mesh buffers (and optional prebuilt BVHs) in Three.js geometry. */
export function createPreview3dModelFromMesh(
  mesh: ParsedOffMesh,
  version: string,
  bvh?: Array<SerializedMeshBvh | null>
): ParsedPreview3dModel {
  const groups = mesh.groups.map((group, index) => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(group.positions, 3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(group.normals, 3));
    if (group.colors) {
      geometry.setAttribute('color', new THREE.BufferAttribute(group.colors, 3, true));
    }

    // The parser already tracked bounds, so skip three's extra passes over
    // every vertex. The sphere is the box's circumsphere: slightly loose, but
    // valid for frustum culling and raycast early-outs.
    const boundingBox = new THREE.Box3(
      new THREE.Vector3(...group.boundsMin),
      new THREE.Vector3(...group.boundsMax)
    );
    geometry.boundingBox = boundingBox;
    geometry.boundingSphere = boundingBox.isEmpty()
      ? new THREE.Sphere()
      : boundingBox.getBoundingSphere(new THREE.Sphere());

    const serializedBvh = bvh?.[index];
    if (serializedBvh) {
      // (three-mesh-bvh's bundled typings predate indirect BVHs, hence the cast.)
      geometry.boundsTree = MeshBVH.deserialize(
        {
          roots: serializedBvh.roots,
          indirectBuffer: serializedBvh.indirectBuffer,
          index: null,
        } as unknown as Parameters<typeof MeshBVH.deserialize>[0],
        geometry,
        { setIndex: false }
      );
    }

    return {
      key: group.key,
      geometry,
      color: new THREE.Color(group.color[0], group.color[1], group.color[2]),
      opacity: group.opacity,
      transparent: group.opacity < 1,
    };
  });

  const sourceBox = new THREE.Box3(
    new THREE.Vector3(...mesh.boundsMin),
    new THREE.Vector3(...mesh.boundsMax)
  );
  const frame = buildModelFrameFromSourceBox(sourceBox, version);

  return {
    frame,
    groups,
    dispose: () => {
      for (const group of groups) {
        group.geometry.dispose();
      }
    },
  };
}

export function parseOffPreviewBytes(args: {
  bytes: Uint8Array;
  fallbackColor: string;
  version: string;
}): ParsedPreview3dModel {
  return createPreview3dModelFromMesh(
    parseOffMesh(args.bytes, toOffRgba(args.fallbackColor)),
    args.version
  );
}

export function parseOffPreviewModel(args: {
  content: string;
  fallbackColor: string;
  version: string;
}): ParsedPreview3dModel {
  // OFF is plain ASCII, so a direct char-code copy avoids needing TextEncoder
  // (missing in some test environments). Non-ASCII can only appear in comments.
  const bytes = new Uint8Array(args.content.length);
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = args.content.charCodeAt(i) & 0xff;
  }

  return parseOffPreviewBytes({
    bytes,
    fallbackColor: args.fallbackColor,
    version: args.version,
  });
}

async function fetchPreviewBytes(url: string): Promise<ArrayBuffer> {
  const response = await fetch(url);
  if ('ok' in response && response.ok === false) {
    throw new Error(`Failed to load preview model (${response.status}).`);
  }

  return response.arrayBuffer();
}

export async function loadOffPreviewModelFromUrl(args: {
  url: string;
  fallbackColor: string;
  version: string;
}): Promise<ParsedPreview3dModel> {
  let buffer = await fetchPreviewBytes(args.url);
  const byteLength = buffer.byteLength;
  const parseStartedAt = perfNow();

  if (byteLength >= WORKER_PARSE_MIN_BYTES && isPreviewMeshWorkerAvailable()) {
    try {
      const parsed = await parseOffMeshInWorker(buffer, toOffRgba(args.fallbackColor));
      const model = createPreview3dModelFromMesh(parsed.mesh, args.version, parsed.bvh);
      perfMeasure('preview-parse', parseStartedAt, {
        bytes: byteLength,
        worker: true,
        workerParseMs: parsed.timings.parseMs,
        workerBvhMs: parsed.timings.bvhMs,
      });
      return model;
    } catch (error) {
      if (!(error instanceof PreviewMeshWorkerUnavailableError)) {
        throw error;
      }
      // The buffer was transferred to the (now dead) worker; fetch it again and
      // fall through to the main-thread parser.
      buffer = await fetchPreviewBytes(args.url);
    }
  }

  const model = parseOffPreviewBytes({
    bytes: new Uint8Array(buffer),
    fallbackColor: args.fallbackColor,
    version: args.version,
  });
  perfMeasure('preview-parse', parseStartedAt, { bytes: byteLength, worker: false });
  return model;
}

export function buildPreview3dObject(args: {
  parsed: ParsedPreview3dModel;
  sceneStyle: PreviewSceneStyle;
  useModelColors?: boolean;
  wireframe?: boolean;
}): BuiltPreview3dObject {
  const { parsed, sceneStyle, useModelColors = true, wireframe = false } = args;
  const root = new THREE.Group();
  root.name = 'modelContainer';
  root.rotation.x = -Math.PI / 2;

  const materials: THREE.Material[] = [];
  const meshes = parsed.groups.map((group) => {
    // Batches that mix several face colors carry them per vertex.
    const vertexColors = useModelColors && group.geometry.hasAttribute('color');
    const materialColor = vertexColors
      ? new THREE.Color(1, 1, 1)
      : useModelColors
        ? group.color
        : new THREE.Color(sceneStyle.modelColor);
    const materialOpacity = useModelColors ? group.opacity : 1;
    const materialTransparent = useModelColors ? group.transparent : false;
    const material = wireframe
      ? new THREE.MeshBasicMaterial({
          color: materialColor,
          wireframe: true,
          vertexColors,
          transparent: materialTransparent,
          opacity: materialOpacity,
          side: THREE.DoubleSide,
        })
      : new THREE.MeshStandardMaterial({
          color: materialColor,
          metalness: sceneStyle.material.metalness,
          roughness: sceneStyle.material.roughness,
          envMapIntensity: sceneStyle.material.envMapIntensity,
          vertexColors,
          transparent: materialTransparent,
          opacity: materialOpacity,
          side: THREE.DoubleSide,
        });

    materials.push(material);

    const mesh = new THREE.Mesh(group.geometry, material);
    if (group.geometry.boundsTree) {
      // Dense meshes arrive with a prebuilt BVH (see previewMeshWorker).
      mesh.raycast = acceleratedRaycast;
    }
    // Keep preview lighting stable with environment/contact shadows only.
    // Shadow-map self-shadowing on thin OpenSCAD solids creates phantom
    // silhouettes that do not match any visible geometry in the viewer.
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.name = `previewMesh:${group.key}`;
    root.add(mesh);
    return mesh;
  });
  root.updateMatrixWorld(true);

  return {
    root,
    meshes,
    dispose: () => {
      for (const material of materials) {
        material.dispose();
      }
    },
  };
}
