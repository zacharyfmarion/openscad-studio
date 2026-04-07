import * as THREE from 'three';
import { toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { PreviewSceneStyle } from './previewSceneConfig';
import { buildModelFrameFromSourceBox, type ModelFrame } from './previewFraming';

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

interface MutableGroupData {
  color: [number, number, number, number];
  positions: number[];
  indices: number[];
  vertexMap: Map<number, number>;
}

const DEFAULT_CREASE_ANGLE = Math.PI / 3;

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value));
}

function normalizeColorChannel(value: number, isAlpha: boolean) {
  if (!Number.isFinite(value)) {
    return isAlpha ? 1 : 0;
  }

  if (value >= 0 && value <= 1) {
    return clamp01(value);
  }

  return clamp01(value / 255);
}

function parseFaceColor(
  values: number[],
  fallbackColor: [number, number, number, number]
): [number, number, number, number] {
  if (values.length < 3) {
    return fallbackColor;
  }

  // OpenSCAD writes "0 0 0 0" for faces with no assigned color (and emits
  // "Invalid color in OFF export" warnings). Treat fully-zero RGBA as
  // "no color" and use the fallback instead of rendering invisible faces.
  if (
    values.length >= 4 &&
    values[0] === 0 &&
    values[1] === 0 &&
    values[2] === 0 &&
    values[3] === 0
  ) {
    return fallbackColor;
  }

  return [
    normalizeColorChannel(values[0], false),
    normalizeColorChannel(values[1], false),
    normalizeColorChannel(values[2], false),
    normalizeColorChannel(values[3] ?? 1, true),
  ];
}

function buildFanTriangles(faceVertices: number[]) {
  const triangles: Array<[number, number, number]> = [];

  for (let triangleIndex = 1; triangleIndex < faceVertices.length - 1; triangleIndex += 1) {
    triangles.push([faceVertices[0], faceVertices[triangleIndex], faceVertices[triangleIndex + 1]]);
  }

  return triangles;
}

function createProjectionBasis(normal: THREE.Vector3) {
  const tangentSeed =
    Math.abs(normal.z) < 0.9 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(0, 1, 0);
  const tangent = new THREE.Vector3().crossVectors(tangentSeed, normal).normalize();
  const bitangent = new THREE.Vector3().crossVectors(normal, tangent).normalize();
  return { tangent, bitangent };
}

function triangulateFace(
  faceVertices: number[],
  vertices: Array<[number, number, number]>
): Array<[number, number, number]> {
  if (faceVertices.length <= 3) {
    return faceVertices.length === 3 ? [[faceVertices[0], faceVertices[1], faceVertices[2]]] : [];
  }

  const points3d = faceVertices.map((vertexIndex) => {
    const vertex = vertices[vertexIndex];
    if (!vertex) {
      throw new Error(`Invalid OFF preview: face references missing vertex ${vertexIndex}.`);
    }
    return new THREE.Vector3(vertex[0], vertex[1], vertex[2]);
  });

  const faceNormal = new THREE.Vector3();
  for (let index = 0; index < points3d.length; index += 1) {
    const current = points3d[index];
    const next = points3d[(index + 1) % points3d.length];
    faceNormal.x += (current.y - next.y) * (current.z + next.z);
    faceNormal.y += (current.z - next.z) * (current.x + next.x);
    faceNormal.z += (current.x - next.x) * (current.y + next.y);
  }

  if (faceNormal.lengthSq() <= Number.EPSILON) {
    return buildFanTriangles(faceVertices);
  }

  faceNormal.normalize();
  const origin = points3d[0];
  const { tangent, bitangent } = createProjectionBasis(faceNormal);
  const contour = points3d.map((point) => {
    const relative = point.clone().sub(origin);
    return new THREE.Vector2(relative.dot(tangent), relative.dot(bitangent));
  });

  const needsReversal = THREE.ShapeUtils.isClockWise(contour);
  const orderedContour = needsReversal ? [...contour].reverse() : contour;
  const orderedVertices = needsReversal ? [...faceVertices].reverse() : faceVertices;

  const triangles = THREE.ShapeUtils.triangulateShape(orderedContour, []);
  if (triangles.length === 0) {
    return buildFanTriangles(faceVertices);
  }

  return triangles.map(([a, b, c]) => [orderedVertices[a], orderedVertices[b], orderedVertices[c]]);
}

function parseHeaderAndCounts(lines: string[]) {
  if (lines.length === 0) {
    throw new Error('OFF preview is empty.');
  }

  let countsLine = '';
  let currentLine = 0;

  if (lines[0].match(/^OFF(\s|$)/)) {
    countsLine = lines[0].slice(3).trim();
    currentLine = 1;
  } else if (lines[0] === 'OFF' && lines.length > 1) {
    countsLine = lines[1].trim();
    currentLine = 2;
  } else {
    throw new Error('Invalid OFF preview: missing OFF header.');
  }

  const [vertexCount, faceCount] = countsLine.split(/\s+/).map(Number);
  if (!Number.isFinite(vertexCount) || !Number.isFinite(faceCount)) {
    throw new Error('Invalid OFF preview: bad vertex or face counts.');
  }

  return { currentLine, vertexCount, faceCount };
}

export function parseOffPreviewModel(args: {
  content: string;
  fallbackColor: string;
  version: string;
}): ParsedPreview3dModel {
  const lines = args.content
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'));
  const { currentLine: vertexStart, vertexCount, faceCount } = parseHeaderAndCounts(lines);

  if (vertexStart + vertexCount + faceCount > lines.length) {
    throw new Error('Invalid OFF preview: file ended before all vertices/faces were read.');
  }

  const fallback = new THREE.Color(args.fallbackColor);
  const fallbackColor: [number, number, number, number] = [fallback.r, fallback.g, fallback.b, 1];
  const vertices: Array<[number, number, number]> = [];
  const sourceBox = new THREE.Box3();

  for (let i = 0; i < vertexCount; i += 1) {
    const parts = lines[vertexStart + i].split(/\s+/).map(Number);
    if (parts.length < 3 || parts.slice(0, 3).some((value) => !Number.isFinite(value))) {
      throw new Error(`Invalid OFF preview: bad vertex on line ${vertexStart + i + 1}.`);
    }

    const vertex: [number, number, number] = [parts[0], parts[1], parts[2]];
    vertices.push(vertex);
    sourceBox.expandByPoint(new THREE.Vector3(...vertex));
  }

  const groupedFaces = new Map<string, MutableGroupData>();
  const faceStart = vertexStart + vertexCount;

  for (let i = 0; i < faceCount; i += 1) {
    const parts = lines[faceStart + i].split(/\s+/).map(Number);
    const vertexTotal = parts[0];

    if (!Number.isFinite(vertexTotal) || vertexTotal < 3) {
      throw new Error(`Invalid OFF preview: bad face on line ${faceStart + i + 1}.`);
    }

    const faceVertices = parts.slice(1, vertexTotal + 1);
    const faceColor = parseFaceColor(parts.slice(vertexTotal + 1), fallbackColor);
    const key = faceColor.map((value) => value.toFixed(4)).join('|');
    let group = groupedFaces.get(key);

    if (!group) {
      group = {
        color: faceColor,
        positions: [],
        indices: [],
        vertexMap: new Map<number, number>(),
      };
      groupedFaces.set(key, group);
    }

    const addVertex = (vertexIndex: number) => {
      const existing = group.vertexMap.get(vertexIndex);
      if (existing !== undefined) {
        return existing;
      }

      const vertex = vertices[vertexIndex];
      if (!vertex) {
        throw new Error(`Invalid OFF preview: face references missing vertex ${vertexIndex}.`);
      }

      const nextIndex = group.positions.length / 3;
      group.positions.push(vertex[0], vertex[1], vertex[2]);
      group.vertexMap.set(vertexIndex, nextIndex);
      return nextIndex;
    };

    const triangles = triangulateFace(faceVertices, vertices);
    for (const [a, b, c] of triangles) {
      group.indices.push(addVertex(a), addVertex(b), addVertex(c));
    }
  }

  const groups = Array.from(groupedFaces.entries()).map(([key, group]) => {
    const indexedGeometry = new THREE.BufferGeometry();
    indexedGeometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(new Float32Array(group.positions), 3)
    );
    indexedGeometry.setIndex(
      group.positions.length / 3 > 65535
        ? new THREE.Uint32BufferAttribute(new Uint32Array(group.indices), 1)
        : new THREE.Uint16BufferAttribute(new Uint16Array(group.indices), 1)
    );
    indexedGeometry.computeBoundingBox();

    const geometry = toCreasedNormals(indexedGeometry, DEFAULT_CREASE_ANGLE);
    if (geometry !== indexedGeometry) {
      indexedGeometry.dispose();
    }
    geometry.computeBoundingBox();

    const color = new THREE.Color(group.color[0], group.color[1], group.color[2]);
    const opacity = group.color[3];

    return {
      key,
      geometry,
      color,
      opacity,
      transparent: opacity < 1,
    };
  });

  const frame = buildModelFrameFromSourceBox(sourceBox, args.version);

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

export async function loadOffPreviewModelFromUrl(args: {
  url: string;
  fallbackColor: string;
  version: string;
}): Promise<ParsedPreview3dModel> {
  const response = await fetch(args.url);
  if ('ok' in response && response.ok === false) {
    throw new Error(`Failed to load preview model (${response.status}).`);
  }

  const content = await response.text();
  return parseOffPreviewModel({
    content,
    fallbackColor: args.fallbackColor,
    version: args.version,
  });
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
    const materialColor = useModelColors ? group.color : new THREE.Color(sceneStyle.modelColor);
    const materialOpacity = useModelColors ? group.opacity : 1;
    const materialTransparent = useModelColors ? group.transparent : false;
    const material = wireframe
      ? new THREE.MeshBasicMaterial({
          color: materialColor,
          wireframe: true,
          transparent: materialTransparent,
          opacity: materialOpacity,
          side: THREE.DoubleSide,
        })
      : new THREE.MeshStandardMaterial({
          color: materialColor,
          metalness: sceneStyle.material.metalness,
          roughness: sceneStyle.material.roughness,
          envMapIntensity: sceneStyle.material.envMapIntensity,
          transparent: materialTransparent,
          opacity: materialOpacity,
          side: THREE.DoubleSide,
        });

    materials.push(material);

    const mesh = new THREE.Mesh(group.geometry, material);
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
