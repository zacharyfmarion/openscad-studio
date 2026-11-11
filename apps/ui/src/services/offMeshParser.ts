/**
 * Fast OFF → renderable triangle soup conversion for the 3D preview.
 *
 * This module is deliberately free of DOM and React dependencies so it can run
 * either on the main thread (small models, tests) or inside the preview mesh
 * worker (large models). It works directly on the UTF-8 bytes OpenSCAD wrote,
 * keeps everything in typed arrays, and produces non-indexed position/normal
 * buffers with crease-aware smooth normals (the same shading model as
 * three's `toCreasedNormals`, but computed from the OFF connectivity instead of
 * re-hashing every vertex position).
 */

import * as THREE from 'three';

export type OffRgba = [number, number, number, number];

export interface ParsedOffGroup {
  /** Stable identifier derived from the normalized face color. */
  key: string;
  color: [number, number, number];
  opacity: number;
  /** Non-indexed triangle positions (9 floats per triangle). */
  positions: Float32Array;
  /** Per-vertex normals matching `positions`. */
  normals: Float32Array;
  boundsMin: [number, number, number];
  boundsMax: [number, number, number];
}

export interface ParsedOffMesh {
  groups: ParsedOffGroup[];
  /** Bounds of every vertex declared in the file, in OpenSCAD coordinates. */
  boundsMin: [number, number, number];
  boundsMax: [number, number, number];
  triangleCount: number;
}

export const DEFAULT_CREASE_ANGLE = Math.PI / 3;

const LF = 10;
const CR = 13;
const TAB = 9;
const SPACE = 32;
const HASH = 35;
const PLUS = 43;
const MINUS = 45;
const DOT = 46;
const ZERO = 48;
const NINE = 57;

// Exact powers of ten: mantissa / POW10[k] is correctly rounded for mantissas
// below 2^53, so short decimals parse to the same double `Number()` would give.
const POW10 = [1, 1e1, 1e2, 1e3, 1e4, 1e5, 1e6, 1e7, 1e8, 1e9, 1e10, 1e11, 1e12, 1e13, 1e14, 1e15];
const MAX_FAST_DIGITS = 15;

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

function buildFanTriangles(faceVertices: ArrayLike<number>, count: number, out: number[]) {
  for (let i = 1; i < count - 1; i += 1) {
    out.push(faceVertices[0], faceVertices[i], faceVertices[i + 1]);
  }
}

function createProjectionBasis(normal: THREE.Vector3) {
  const tangentSeed =
    Math.abs(normal.z) < 0.9 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(0, 1, 0);
  const tangent = new THREE.Vector3().crossVectors(tangentSeed, normal).normalize();
  const bitangent = new THREE.Vector3().crossVectors(normal, tangent).normalize();
  return { tangent, bitangent };
}

/** Ear-clip a polygon with more than three vertices. Rare: Manifold emits triangles. */
function triangulatePolygon(
  faceVertices: ArrayLike<number>,
  count: number,
  vertices: Float64Array,
  out: number[]
) {
  const points3d: THREE.Vector3[] = [];
  for (let i = 0; i < count; i += 1) {
    const offset = faceVertices[i] * 3;
    points3d.push(new THREE.Vector3(vertices[offset], vertices[offset + 1], vertices[offset + 2]));
  }

  const faceNormal = new THREE.Vector3();
  for (let index = 0; index < count; index += 1) {
    const current = points3d[index];
    const next = points3d[(index + 1) % count];
    faceNormal.x += (current.y - next.y) * (current.z + next.z);
    faceNormal.y += (current.z - next.z) * (current.x + next.x);
    faceNormal.z += (current.x - next.x) * (current.y + next.y);
  }

  if (faceNormal.lengthSq() <= Number.EPSILON) {
    buildFanTriangles(faceVertices, count, out);
    return;
  }

  faceNormal.normalize();
  const origin = points3d[0];
  const { tangent, bitangent } = createProjectionBasis(faceNormal);
  const contour = points3d.map((point) => {
    const relative = point.clone().sub(origin);
    return new THREE.Vector2(relative.dot(tangent), relative.dot(bitangent));
  });

  const ordered: number[] = Array.from({ length: count }, (_, i) => faceVertices[i]);
  const needsReversal = THREE.ShapeUtils.isClockWise(contour);
  if (needsReversal) {
    contour.reverse();
    ordered.reverse();
  }

  const triangles = THREE.ShapeUtils.triangulateShape(contour, []);
  if (triangles.length === 0) {
    buildFanTriangles(faceVertices, count, out);
    return;
  }

  for (const [a, b, c] of triangles) {
    out.push(ordered[a], ordered[b], ordered[c]);
  }
}

interface GroupAccumulator {
  key: string;
  color: OffRgba;
  triangleCount: number;
}

/**
 * Map every vertex to the first vertex with identical coordinates so shading
 * stays smooth across faces even when the exporter duplicated vertices.
 */
function weldIdenticalVertices(vertices: Float64Array, vertexCount: number): Uint32Array {
  const canonical = new Uint32Array(vertexCount);
  let tableSize = 16;
  while (tableSize < vertexCount * 2) {
    tableSize *= 2;
  }
  const mask = tableSize - 1;
  const table = new Int32Array(tableSize).fill(-1);
  const scratch = new Float32Array(3);
  const bits = new Uint32Array(scratch.buffer);

  for (let v = 0; v < vertexCount; v += 1) {
    const x = vertices[v * 3];
    const y = vertices[v * 3 + 1];
    const z = vertices[v * 3 + 2];
    // `+ 0` folds -0 into +0 so they hash identically.
    scratch[0] = x + 0;
    scratch[1] = y + 0;
    scratch[2] = z + 0;
    let slot =
      (Math.imul(bits[0], 0x9e3779b1) ^
        Math.imul(bits[1], 0x85ebca6b) ^
        Math.imul(bits[2], 0xc2b2ae35)) &
      mask;

    for (;;) {
      const candidate = table[slot];
      if (candidate === -1) {
        table[slot] = v;
        canonical[v] = v;
        break;
      }
      if (
        vertices[candidate * 3] === x &&
        vertices[candidate * 3 + 1] === y &&
        vertices[candidate * 3 + 2] === z
      ) {
        canonical[v] = candidate;
        break;
      }
      slot = (slot + 1) & mask;
    }
  }

  return canonical;
}

export function parseOffMesh(
  bytes: Uint8Array,
  fallbackColor: OffRgba,
  creaseAngle = DEFAULT_CREASE_ANGLE
): ParsedOffMesh {
  const length = bytes.length;
  let pos = 0;
  let contentLine = 0;

  /** Advance to the first character of the next non-blank, non-comment line. */
  const nextContentLine = (): boolean => {
    for (;;) {
      while (pos < length) {
        const c = bytes[pos];
        if (c !== SPACE && c !== TAB && c !== CR && c !== LF) break;
        pos += 1;
      }
      if (pos >= length) return false;
      if (bytes[pos] !== HASH) {
        contentLine += 1;
        return true;
      }
      while (pos < length && bytes[pos] !== LF) pos += 1;
    }
  };

  const skipLine = () => {
    while (pos < length && bytes[pos] !== LF) pos += 1;
  };

  /** Read the next number on the current line, or NaN at end of line / bad token. */
  const readNumber = (): number => {
    let c = bytes[pos];
    while (pos < length && (c === SPACE || c === TAB || c === CR)) {
      pos += 1;
      c = bytes[pos];
    }
    if (pos >= length || c === LF) return NaN;

    const start = pos;
    let negative = false;
    if (c === MINUS) {
      negative = true;
      pos += 1;
      c = bytes[pos];
    } else if (c === PLUS) {
      pos += 1;
      c = bytes[pos];
    }

    let mantissa = 0;
    let digits = 0;
    let fractionDigits = 0;
    let seenDot = false;
    while (pos < length) {
      if (c >= ZERO && c <= NINE) {
        mantissa = mantissa * 10 + (c - ZERO);
        digits += 1;
        if (seenDot) fractionDigits += 1;
      } else if (c === DOT && !seenDot) {
        seenDot = true;
      } else {
        break;
      }
      pos += 1;
      c = bytes[pos];
    }

    const atTokenEnd = pos >= length || c === SPACE || c === LF || c === TAB || c === CR;
    if (atTokenEnd && digits > 0 && digits <= MAX_FAST_DIGITS) {
      const value = fractionDigits > 0 ? mantissa / POW10[fractionDigits] : mantissa;
      return negative ? -value : value;
    }

    // Exponents, very long mantissas, or junk: defer to the spec-compliant parser.
    while (pos < length) {
      c = bytes[pos];
      if (c === SPACE || c === LF || c === TAB || c === CR) break;
      pos += 1;
    }
    let token = '';
    for (let i = start; i < pos; i += 1) token += String.fromCharCode(bytes[i]);
    return Number(token);
  };

  // --- Header -------------------------------------------------------------
  if (!nextContentLine()) {
    throw new Error('OFF preview is empty.');
  }
  const headerEnd = pos + 3;
  const afterHeader = bytes[headerEnd];
  if (
    bytes[pos] !== 79 /* O */ ||
    bytes[pos + 1] !== 70 /* F */ ||
    bytes[pos + 2] !== 70 /* F */ ||
    !(
      headerEnd >= length ||
      afterHeader === SPACE ||
      afterHeader === TAB ||
      afterHeader === CR ||
      afterHeader === LF
    )
  ) {
    throw new Error('Invalid OFF preview: missing OFF header.');
  }
  pos = headerEnd;

  let vertexCount = readNumber();
  if (Number.isNaN(vertexCount)) {
    // Counts may be on the line after the "OFF" keyword.
    skipLine();
    vertexCount = nextContentLine() ? readNumber() : NaN;
  }
  const faceCount = readNumber();
  if (
    !Number.isFinite(vertexCount) ||
    !Number.isFinite(faceCount) ||
    vertexCount < 0 ||
    faceCount < 0
  ) {
    throw new Error('Invalid OFF preview: bad vertex or face counts.');
  }
  skipLine();

  const truncated = () =>
    new Error('Invalid OFF preview: file ended before all vertices/faces were read.');

  // --- Vertices -----------------------------------------------------------
  const vertices = new Float64Array(vertexCount * 3);
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;

  for (let v = 0; v < vertexCount; v += 1) {
    if (!nextContentLine()) throw truncated();
    const x = readNumber();
    const y = readNumber();
    const z = readNumber();
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
      throw new Error(`Invalid OFF preview: bad vertex on line ${contentLine}.`);
    }
    vertices[v * 3] = x;
    vertices[v * 3 + 1] = y;
    vertices[v * 3 + 2] = z;
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (z < minZ) minZ = z;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
    if (z > maxZ) maxZ = z;
    skipLine();
  }

  // --- Faces --------------------------------------------------------------
  let triangleCapacity = Math.max(16, faceCount);
  let triangleVertices = new Uint32Array(triangleCapacity * 3);
  let triangleGroups = new Uint32Array(triangleCapacity);
  let triangleCount = 0;

  const ensureTriangleCapacity = (extra: number) => {
    if (triangleCount + extra <= triangleCapacity) return;
    triangleCapacity = Math.max(triangleCount + extra, Math.ceil(triangleCapacity * 1.5));
    const nextVertices = new Uint32Array(triangleCapacity * 3);
    nextVertices.set(triangleVertices.subarray(0, triangleCount * 3));
    triangleVertices = nextVertices;
    const nextGroups = new Uint32Array(triangleCapacity);
    nextGroups.set(triangleGroups.subarray(0, triangleCount));
    triangleGroups = nextGroups;
  };

  const groups: GroupAccumulator[] = [];
  const groupIndexByKey = new Map<string, number>();
  // Consecutive faces almost always share a color, so remember the last lookup.
  let lastColorCount = -1;
  let lastC0 = 0;
  let lastC1 = 0;
  let lastC2 = 0;
  let lastC3 = 0;
  let lastGroupIndex = -1;

  const resolveGroup = (
    colorCount: number,
    c0: number,
    c1: number,
    c2: number,
    c3: number
  ): number => {
    if (
      colorCount === lastColorCount &&
      (colorCount < 3 ||
        (c0 === lastC0 && c1 === lastC1 && c2 === lastC2 && (colorCount < 4 || c3 === lastC3)))
    ) {
      return lastGroupIndex;
    }

    let color: OffRgba;
    // OpenSCAD writes "0 0 0 0" for faces with no assigned color (and emits
    // "Invalid color in OFF export" warnings). Treat fully-zero RGBA as
    // "no color" and use the fallback instead of rendering invisible faces.
    if (colorCount < 3 || (colorCount >= 4 && c0 === 0 && c1 === 0 && c2 === 0 && c3 === 0)) {
      color = fallbackColor;
    } else {
      color = [
        normalizeColorChannel(c0, false),
        normalizeColorChannel(c1, false),
        normalizeColorChannel(c2, false),
        normalizeColorChannel(colorCount >= 4 ? c3 : 1, true),
      ];
    }

    const key = color.map((value) => value.toFixed(4)).join('|');
    let groupIndex = groupIndexByKey.get(key);
    if (groupIndex === undefined) {
      groupIndex = groups.length;
      groups.push({ key, color, triangleCount: 0 });
      groupIndexByKey.set(key, groupIndex);
    }

    lastColorCount = colorCount;
    lastC0 = c0;
    lastC1 = c1;
    lastC2 = c2;
    lastC3 = c3;
    lastGroupIndex = groupIndex;
    return groupIndex;
  };

  let faceScratch = new Uint32Array(16);
  const polygonTriangles: number[] = [];

  for (let f = 0; f < faceCount; f += 1) {
    if (!nextContentLine()) throw truncated();
    const cornerCount = readNumber();
    if (!Number.isInteger(cornerCount) || cornerCount < 3) {
      throw new Error(`Invalid OFF preview: bad face on line ${contentLine}.`);
    }
    if (cornerCount > faceScratch.length) {
      faceScratch = new Uint32Array(cornerCount * 2);
    }
    for (let i = 0; i < cornerCount; i += 1) {
      const vertexIndex = readNumber();
      if (!Number.isInteger(vertexIndex) || vertexIndex < 0 || vertexIndex >= vertexCount) {
        throw new Error(`Invalid OFF preview: face references missing vertex ${vertexIndex}.`);
      }
      faceScratch[i] = vertexIndex;
    }

    const c0 = readNumber();
    const c1 = Number.isNaN(c0) ? NaN : readNumber();
    const c2 = Number.isNaN(c1) ? NaN : readNumber();
    const c3 = Number.isNaN(c2) ? NaN : readNumber();
    const colorCount = Number.isNaN(c0)
      ? 0
      : Number.isNaN(c1)
        ? 1
        : Number.isNaN(c2)
          ? 2
          : Number.isNaN(c3)
            ? 3
            : 4;
    skipLine();

    const groupIndex = resolveGroup(colorCount, c0, c1, c2, c3);

    if (cornerCount === 3) {
      ensureTriangleCapacity(1);
      const offset = triangleCount * 3;
      triangleVertices[offset] = faceScratch[0];
      triangleVertices[offset + 1] = faceScratch[1];
      triangleVertices[offset + 2] = faceScratch[2];
      triangleGroups[triangleCount] = groupIndex;
      triangleCount += 1;
      groups[groupIndex].triangleCount += 1;
      continue;
    }

    polygonTriangles.length = 0;
    triangulatePolygon(faceScratch, cornerCount, vertices, polygonTriangles);
    const added = polygonTriangles.length / 3;
    ensureTriangleCapacity(added);
    for (let i = 0; i < added; i += 1) {
      const offset = triangleCount * 3;
      triangleVertices[offset] = polygonTriangles[i * 3];
      triangleVertices[offset + 1] = polygonTriangles[i * 3 + 1];
      triangleVertices[offset + 2] = polygonTriangles[i * 3 + 2];
      triangleGroups[triangleCount] = groupIndex;
      triangleCount += 1;
    }
    groups[groupIndex].triangleCount += added;
  }

  // --- Face normals + vertex adjacency --------------------------------------
  const canonical = weldIdenticalVertices(vertices, vertexCount);
  const faceNormals = new Float32Array(triangleCount * 3);
  const adjacencyOffsets = new Uint32Array(vertexCount + 1);

  for (let t = 0; t < triangleCount; t += 1) {
    const a = triangleVertices[t * 3] * 3;
    const b = triangleVertices[t * 3 + 1] * 3;
    const c = triangleVertices[t * 3 + 2] * 3;
    const abx = vertices[b] - vertices[a];
    const aby = vertices[b + 1] - vertices[a + 1];
    const abz = vertices[b + 2] - vertices[a + 2];
    const acx = vertices[c] - vertices[a];
    const acy = vertices[c + 1] - vertices[a + 1];
    const acz = vertices[c + 2] - vertices[a + 2];
    let nx = aby * acz - abz * acy;
    let ny = abz * acx - abx * acz;
    let nz = abx * acy - aby * acx;
    const normalLength = Math.sqrt(nx * nx + ny * ny + nz * nz);
    if (normalLength > 0) {
      nx /= normalLength;
      ny /= normalLength;
      nz /= normalLength;
    }
    faceNormals[t * 3] = nx;
    faceNormals[t * 3 + 1] = ny;
    faceNormals[t * 3 + 2] = nz;

    adjacencyOffsets[canonical[triangleVertices[t * 3]] + 1] += 1;
    adjacencyOffsets[canonical[triangleVertices[t * 3 + 1]] + 1] += 1;
    adjacencyOffsets[canonical[triangleVertices[t * 3 + 2]] + 1] += 1;
  }

  for (let v = 0; v < vertexCount; v += 1) {
    adjacencyOffsets[v + 1] += adjacencyOffsets[v];
  }
  const adjacency = new Uint32Array(triangleCount * 3);
  const adjacencyCursor = adjacencyOffsets.slice(0, vertexCount);
  for (let t = 0; t < triangleCount; t += 1) {
    for (let corner = 0; corner < 3; corner += 1) {
      const v = canonical[triangleVertices[t * 3 + corner]];
      adjacency[adjacencyCursor[v]] = t;
      adjacencyCursor[v] += 1;
    }
  }

  // --- Emit per-group buffers with creased normals --------------------------
  const creaseDot = Math.cos(creaseAngle);
  const output = groups.map((group) => ({
    key: group.key,
    color: [group.color[0], group.color[1], group.color[2]] as [number, number, number],
    opacity: group.color[3],
    positions: new Float32Array(group.triangleCount * 9),
    normals: new Float32Array(group.triangleCount * 9),
    boundsMin: [Infinity, Infinity, Infinity] as [number, number, number],
    boundsMax: [-Infinity, -Infinity, -Infinity] as [number, number, number],
    cursor: 0,
  }));

  for (let t = 0; t < triangleCount; t += 1) {
    const groupIndex = triangleGroups[t];
    const target = output[groupIndex];
    const { positions, normals, boundsMin, boundsMax } = target;
    const fnx = faceNormals[t * 3];
    const fny = faceNormals[t * 3 + 1];
    const fnz = faceNormals[t * 3 + 2];

    for (let corner = 0; corner < 3; corner += 1) {
      const vertexIndex = triangleVertices[t * 3 + corner];
      const v = canonical[vertexIndex];
      let sx = 0;
      let sy = 0;
      let sz = 0;

      for (let i = adjacencyOffsets[v], end = adjacencyOffsets[v + 1]; i < end; i += 1) {
        const other = adjacency[i];
        if (triangleGroups[other] !== groupIndex) continue;
        const ox = faceNormals[other * 3];
        const oy = faceNormals[other * 3 + 1];
        const oz = faceNormals[other * 3 + 2];
        if (fnx * ox + fny * oy + fnz * oz > creaseDot) {
          sx += ox;
          sy += oy;
          sz += oz;
        }
      }

      const sumLength = Math.sqrt(sx * sx + sy * sy + sz * sz);
      if (sumLength > 0) {
        sx /= sumLength;
        sy /= sumLength;
        sz /= sumLength;
      }

      const x = vertices[vertexIndex * 3];
      const y = vertices[vertexIndex * 3 + 1];
      const z = vertices[vertexIndex * 3 + 2];
      const out = target.cursor;
      positions[out] = x;
      positions[out + 1] = y;
      positions[out + 2] = z;
      normals[out] = sx;
      normals[out + 1] = sy;
      normals[out + 2] = sz;
      target.cursor = out + 3;

      if (x < boundsMin[0]) boundsMin[0] = x;
      if (y < boundsMin[1]) boundsMin[1] = y;
      if (z < boundsMin[2]) boundsMin[2] = z;
      if (x > boundsMax[0]) boundsMax[0] = x;
      if (y > boundsMax[1]) boundsMax[1] = y;
      if (z > boundsMax[2]) boundsMax[2] = z;
    }
  }

  return {
    groups: output.map((group) => ({
      key: group.key,
      color: group.color,
      opacity: group.opacity,
      positions: group.positions,
      normals: group.normals,
      boundsMin: group.boundsMin,
      boundsMax: group.boundsMax,
    })),
    boundsMin: [minX, minY, minZ],
    boundsMax: [maxX, maxY, maxZ],
    triangleCount,
  };
}
