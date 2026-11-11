import * as THREE from 'three';
import { toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { DEFAULT_CREASE_ANGLE, parseOffMesh, type OffRgba } from '../offMeshParser';

const FALLBACK: OffRgba = [0.2, 0.4, 0.6, 1];

function encode(content: string) {
  const bytes = new Uint8Array(content.length);
  for (let i = 0; i < content.length; i += 1) {
    bytes[i] = content.charCodeAt(i);
  }
  return bytes;
}

function parse(lines: string[], separator = '\n') {
  return parseOffMesh(encode(lines.join(separator)), FALLBACK);
}

const UNIT_CUBE = [
  'OFF 8 12 0',
  '0 0 0',
  '1 0 0',
  '1 1 0',
  '0 1 0',
  '0 0 1',
  '1 0 1',
  '1 1 1',
  '0 1 1',
  '3 0 2 1',
  '3 0 3 2',
  '3 4 5 6',
  '3 4 6 7',
  '3 0 1 5',
  '3 0 5 4',
  '3 2 3 7',
  '3 2 7 6',
  '3 1 2 6',
  '3 1 6 5',
  '3 0 4 7',
  '3 0 7 3',
];

describe('parseOffMesh', () => {
  it('parses numbers in every notation OpenSCAD can emit', () => {
    const mesh = parse([
      'OFF 3 1 0',
      '-1.5 +2 3e1',
      '0.000001 1.25E-2 -0',
      '123456789.12345678 .5 7.',
      '3 0 1 2',
    ]);

    expect(Array.from(mesh.groups[0].positions)).toEqual(
      Array.from(new Float32Array([-1.5, 2, 30, 0.000001, 0.0125, -0, 123456789.12345678, 0.5, 7]))
    );
    expect(mesh.boundsMin).toEqual([-1.5, 0.0125, -0]);
    expect(mesh.boundsMax).toEqual([123456789.12345678, 2, 30]);
  });

  it('accepts comments, blank lines, CRLF line endings and counts on their own line', () => {
    const mesh = parse(
      [
        '# exported by OpenSCAD',
        'OFF',
        '',
        '3 1 0',
        '0 0 0',
        '# vertex comment',
        '1 0 0',
        '0 1 0',
        '',
        '3 0 1 2 255 0 0',
        '',
      ],
      '\r\n'
    );

    expect(mesh.triangleCount).toBe(1);
    expect(mesh.groups).toHaveLength(1);
    expect(mesh.groups[0].color).toEqual([1, 0, 0]);
  });

  it('keeps groups in first-seen order and reports per-group bounds', () => {
    const mesh = parse([
      'OFF 6 3 0',
      '0 0 0',
      '1 0 0',
      '0 1 0',
      '5 5 5',
      '6 5 5',
      '5 6 5',
      '3 0 1 2 0 0 255',
      '3 3 4 5 255 0 0 128',
      '3 0 2 1 0 0 255',
    ]);

    expect(mesh.groups.map((group) => group.color)).toEqual([
      [0, 0, 1],
      [1, 0, 0],
    ]);
    expect(mesh.groups[0].positions).toHaveLength(18);
    expect(mesh.groups[1].opacity).toBeCloseTo(128 / 255, 5);
    expect(mesh.groups[1].boundsMin).toEqual([5, 5, 5]);
    expect(mesh.groups[1].boundsMax).toEqual([6, 6, 5]);
  });

  it('merges opaque faces of different colors into one batch with vertex colors', () => {
    const mesh = parse([
      'OFF 9 4 0',
      '0 0 0',
      '1 0 0',
      '0 1 0',
      '5 5 5',
      '6 5 5',
      '5 6 5',
      '9 9 9',
      '10 9 9',
      '9 10 9',
      '3 0 1 2 255 0 0',
      '3 3 4 5 0 255 0',
      '3 6 7 8 0 0 255 128',
      '3 0 2 1 255 0 0',
    ]);

    // One opaque batch (red + green) and one translucent batch (blue).
    expect(mesh.groups).toHaveLength(2);
    const [opaque, translucent] = mesh.groups;

    expect(opaque.key).toBe('mixed|1.0000');
    expect(opaque.opacity).toBe(1);
    expect(opaque.positions).toHaveLength(27);
    expect(Array.from(opaque.colors!)).toEqual([
      ...Array(3).fill([65535, 0, 0]).flat(),
      ...Array(3).fill([0, 65535, 0]).flat(),
      ...Array(3).fill([65535, 0, 0]).flat(),
    ]);
    expect(opaque.boundsMax).toEqual([6, 6, 5]);

    expect(translucent.colors).toBeNull();
    expect(translucent.color).toEqual([0, 0, 1]);
    expect(translucent.opacity).toBeCloseTo(128 / 255, 5);
  });

  it('does not smooth normals across a color boundary inside a merged batch', () => {
    // Two coplanar-ish triangles sharing an edge but colored differently.
    const mesh = parse([
      'OFF 4 2 0',
      '0 0 0',
      '1 0 0',
      '0.5 1 0.2',
      '0.5 -1 0.2',
      '3 0 1 2 255 0 0',
      '3 1 0 3 0 255 0',
    ]);
    const { normals } = mesh.groups[0];
    const first = new THREE.Vector3().fromArray(normals, 0);
    const second = new THREE.Vector3().fromArray(normals, 9);

    expect(mesh.groups).toHaveLength(1);
    expect(Math.abs(first.y)).toBeGreaterThan(0.05);
    expect(first.y).toBeCloseTo(-second.y, 5);
  });

  it('gives a cube flat per-face normals', () => {
    const mesh = parse(UNIT_CUBE);
    const { positions, normals } = mesh.groups[0];

    expect(mesh.triangleCount).toBe(12);
    for (let i = 0; i < positions.length; i += 9) {
      const a = new THREE.Vector3().fromArray(positions, i);
      const b = new THREE.Vector3().fromArray(positions, i + 3);
      const c = new THREE.Vector3().fromArray(positions, i + 6);
      const faceNormal = b.clone().sub(a).cross(c.clone().sub(a)).normalize();
      for (let corner = 0; corner < 3; corner += 1) {
        const normal = new THREE.Vector3().fromArray(normals, i + corner * 3);
        expect(normal.distanceTo(faceNormal)).toBeLessThan(1e-6);
      }
    }
  });

  it('smooths across faces even when the exporter duplicated shared vertices', () => {
    // Two triangles forming a shallow ridge; the shared edge is written twice.
    const mesh = parse([
      'OFF 6 2 0',
      '0 0 0',
      '1 0 0',
      '0.5 1 0.1',
      '1 0 0',
      '0 0 0',
      '0.5 -1 0.1',
      '3 0 1 2',
      '3 3 4 5',
    ]);
    const { normals } = mesh.groups[0];
    const firstCorner = new THREE.Vector3().fromArray(normals, 0);
    const mirroredCorner = new THREE.Vector3().fromArray(normals, 12);

    // Vertex (0,0,0) is corner 0 of triangle 1 and corner 1 of triangle 2.
    expect(firstCorner.distanceTo(mirroredCorner)).toBeLessThan(1e-6);
    expect(firstCorner.y).toBeCloseTo(0, 6);
  });

  it("matches three's toCreasedNormals on a smooth-and-creased mesh", () => {
    // A cylinder has both smooth (side) and creased (cap rim) vertices.
    const source = new THREE.CylinderGeometry(40, 40, 60, 48, 3);
    const position = source.getAttribute('position');
    const index = source.getIndex()!;

    // Weld by position so the OFF has shared vertices like OpenSCAD's output.
    const remap: number[] = [];
    const unique: number[][] = [];
    const seen = new Map<string, number>();
    for (let i = 0; i < position.count; i += 1) {
      // Round away float noise so the seam (theta = 0 vs 2π) welds like a real export.
      const vertex = [position.getX(i), position.getY(i), position.getZ(i)].map(
        (value) => Math.round(value * 1e4) / 1e4 + 0
      );
      const key = vertex.join(',');
      let id = seen.get(key);
      if (id === undefined) {
        id = unique.length;
        unique.push(vertex);
        seen.set(key, id);
      }
      remap.push(id);
    }
    const faces: number[][] = [];
    for (let i = 0; i < index.count; i += 3) {
      const face = [remap[index.getX(i)], remap[index.getX(i + 1)], remap[index.getX(i + 2)]];
      if (face[0] !== face[1] && face[1] !== face[2] && face[0] !== face[2]) {
        faces.push(face);
      }
    }

    const mesh = parse([
      `OFF ${unique.length} ${faces.length} 0`,
      ...unique.map((vertex) => vertex.join(' ')),
      ...faces.map((face) => `3 ${face.join(' ')}`),
    ]);

    const reference = new THREE.BufferGeometry();
    reference.setAttribute('position', new THREE.Float32BufferAttribute(unique.flat(), 3));
    reference.setIndex(faces.flat());
    const expected = toCreasedNormals(reference, DEFAULT_CREASE_ANGLE);

    const { positions, normals } = mesh.groups[0];
    expect(Array.from(positions)).toEqual(Array.from(expected.getAttribute('position').array));
    const expectedNormals = expected.getAttribute('normal').array;
    expect(normals).toHaveLength(expectedNormals.length);
    for (let i = 0; i < normals.length; i += 1) {
      expect(normals[i]).toBeCloseTo(expectedNormals[i], 4);
    }
  });

  it('reports malformed files with actionable errors', () => {
    expect(() => parse([])).toThrow('OFF preview is empty.');
    expect(() => parse(['PLY 1 1 0'])).toThrow('missing OFF header');
    expect(() => parse(['OFF x y'])).toThrow('bad vertex or face counts');
    expect(() => parse(['OFF 3 1 0', '0 0 0', '1 0 0'])).toThrow('file ended before');
    expect(() => parse(['OFF 3 1 0', '0 0 0', '1 nope 0', '0 1 0', '3 0 1 2'])).toThrow(
      'bad vertex on line 3'
    );
    expect(() => parse(['OFF 3 1 0', '0 0 0', '1 0 0', '0 1 0', '2 0 1'])).toThrow(
      'bad face on line 5'
    );
    expect(() => parse(['OFF 3 1 0', '0 0 0', '1 0 0', '0 1 0', '3 0 1 9'])).toThrow(
      'face references missing vertex 9'
    );
  });
});
