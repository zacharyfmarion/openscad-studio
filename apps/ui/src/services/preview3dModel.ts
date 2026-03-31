import * as THREE from 'three';
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

  return [
    normalizeColorChannel(values[0], false),
    normalizeColorChannel(values[1], false),
    normalizeColorChannel(values[2], false),
    normalizeColorChannel(values[3] ?? 1, true),
  ];
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

    for (let triangleIndex = 1; triangleIndex < faceVertices.length - 1; triangleIndex += 1) {
      group.indices.push(
        addVertex(faceVertices[0]),
        addVertex(faceVertices[triangleIndex]),
        addVertex(faceVertices[triangleIndex + 1])
      );
    }
  }

  const groups = Array.from(groupedFaces.entries()).map(([key, group]) => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(new Float32Array(group.positions), 3)
    );
    geometry.setIndex(
      group.positions.length / 3 > 65535
        ? new THREE.Uint32BufferAttribute(new Uint32Array(group.indices), 1)
        : new THREE.Uint16BufferAttribute(new Uint16Array(group.indices), 1)
    );
    geometry.computeVertexNormals();
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
  wireframe?: boolean;
}): BuiltPreview3dObject {
  const { parsed, sceneStyle, wireframe = false } = args;
  const root = new THREE.Group();
  root.name = 'modelContainer';
  root.rotation.x = -Math.PI / 2;

  const materials: THREE.Material[] = [];
  const meshes = parsed.groups.map((group) => {
    const material = wireframe
      ? new THREE.MeshBasicMaterial({
          color: group.color,
          wireframe: true,
          transparent: group.transparent,
          opacity: group.opacity,
        })
      : new THREE.MeshStandardMaterial({
          color: group.color,
          metalness: sceneStyle.material.metalness,
          roughness: sceneStyle.material.roughness,
          envMapIntensity: sceneStyle.material.envMapIntensity,
          transparent: group.transparent,
          opacity: group.opacity,
        });

    materials.push(material);

    const mesh = new THREE.Mesh(group.geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
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
