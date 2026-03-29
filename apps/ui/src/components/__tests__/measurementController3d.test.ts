import * as THREE from 'three';
import {
  applyAxisLock3D,
  createMeasurementRecord3D,
  formatMeasurementDetail3D,
  formatMeasurementSummary3D,
  resolveMeasurementPick3D,
} from '../three-viewer/measurementController3d';

function createTestIntersection() {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute([0, 0, 0, 2, 0, 0, 0, 2, 0], 3)
  );
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
  mesh.updateMatrixWorld(true);

  return {
    point: new THREE.Vector3(0.05, 0.05, 0),
    object: mesh,
    face: {
      a: 0,
      b: 1,
      c: 2,
      normal: new THREE.Vector3(0, 0, 1),
    },
  } as unknown as THREE.Intersection<THREE.Object3D>;
}

describe('measurementController3d', () => {
  it('creates measurement records with delta and distance', () => {
    const measurement = createMeasurementRecord3D(
      new THREE.Vector3(1, 2, 3),
      new THREE.Vector3(4, 6, 3),
      123
    );

    expect(measurement.delta.toArray()).toEqual([3, 4, 0]);
    expect(measurement.distance).toBe(5);
    expect(measurement.createdAt).toBe(123);
    expect(formatMeasurementSummary3D(measurement)).toContain('Distance');
    expect(formatMeasurementDetail3D(measurement)).toContain('dx');
  });

  it('locks the measured endpoint to the dominant axis', () => {
    const locked = applyAxisLock3D(new THREE.Vector3(0, 0, 0), new THREE.Vector3(2, 0.5, 0.25));

    expect(locked.axis).toBe('x');
    expect(locked.point.toArray()).toEqual([2, 0, 0]);
  });

  it('snaps to a nearby vertex when snapping is enabled', () => {
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
    camera.position.set(0, 0, 5);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();

    const resolved = resolveMeasurementPick3D({
      intersection: createTestIntersection(),
      camera,
      rect: { left: 0, top: 0, width: 200, height: 200 },
      clientX: 100,
      clientY: 100,
      snapEnabled: true,
    });

    expect(resolved.snapKind).toBe('vertex');
    expect(resolved.point.toArray()).toEqual([0, 0, 0]);
  });

  it('keeps the surface hit when snapping is disabled', () => {
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
    camera.position.set(0, 0, 5);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();

    const resolved = resolveMeasurementPick3D({
      intersection: createTestIntersection(),
      camera,
      rect: { left: 0, top: 0, width: 200, height: 200 },
      clientX: 100,
      clientY: 100,
      snapEnabled: false,
    });

    expect(resolved.snapKind).toBe('surface');
    expect(resolved.point.toArray()).toEqual([0.05, 0.05, 0]);
  });

  it('snaps to an edge midpoint when cursor is closest to the edge', () => {
    // Triangle: (0,0,0), (2,0,0), (0,2,0)
    // Edge midpoints: (1,0,0), (1,1,0), (0,1,0)
    // We place the hit near (1,0,0) — midpoint of edge a→b
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute([0, 0, 0, 2, 0, 0, 0, 2, 0], 3)
    );
    const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
    mesh.updateMatrixWorld(true);

    const intersection = {
      point: new THREE.Vector3(1.05, 0.05, 0), // near edge midpoint (1,0,0)
      object: mesh,
      face: { a: 0, b: 1, c: 2, normal: new THREE.Vector3(0, 0, 1) },
    } as unknown as THREE.Intersection<THREE.Object3D>;

    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
    camera.position.set(0, 0, 5);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();

    // Project edge midpoint (1,0,0) to screen to get the cursor position
    const edgeMidpoint = new THREE.Vector3(1, 0, 0);
    const projected = edgeMidpoint.clone().project(camera);
    const clientX = ((projected.x + 1) / 2) * 200;
    const clientY = ((1 - projected.y) / 2) * 200;

    const resolved = resolveMeasurementPick3D({
      intersection,
      camera,
      rect: { left: 0, top: 0, width: 200, height: 200 },
      clientX,
      clientY,
      snapEnabled: true,
    });

    expect(resolved.snapKind).toBe('edge');
    expect(resolved.point.x).toBeCloseTo(1, 5);
    expect(resolved.point.y).toBeCloseTo(0, 5);
    expect(resolved.point.z).toBeCloseTo(0, 5);
  });

  it('snaps to nearest point along an edge when cursor is not near the midpoint', () => {
    // Triangle: (0,0,0), (2,0,0), (0,2,0)
    // Edge a→b runs from (0,0,0) to (2,0,0). Its midpoint is (1,0,0).
    // Place cursor near (0.3, 0, 0) — on the edge but far from the midpoint.
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute([0, 0, 0, 2, 0, 0, 0, 2, 0], 3)
    );
    const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
    mesh.updateMatrixWorld(true);

    const intersection = {
      point: new THREE.Vector3(0.8, 0.05, 0),
      object: mesh,
      face: { a: 0, b: 1, c: 2, normal: new THREE.Vector3(0, 0, 1) },
    } as unknown as THREE.Intersection<THREE.Object3D>;

    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
    camera.position.set(0, 0, 5);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();

    // Cursor projected from (0.8, 0, 0) — on the edge, far from all three vertices.
    // At camera z=5 with fov=50 on a 200x200 canvas, 1 world unit ≈ 43px, so 0.8 units
    // is ~34px from vertex (0,0,0) and ~52px from vertex (2,0,0) — both beyond the 14px
    // snap threshold, ensuring vertex snap cannot win.
    const cursorTarget = new THREE.Vector3(0.8, 0, 0);
    const projected = cursorTarget.clone().project(camera);
    const clientX = ((projected.x + 1) / 2) * 200;
    const clientY = ((1 - projected.y) / 2) * 200;

    const resolved = resolveMeasurementPick3D({
      intersection,
      camera,
      rect: { left: 0, top: 0, width: 200, height: 200 },
      clientX,
      clientY,
      snapEnabled: true,
    });

    // Should snap to edge (not surface), and point should be near (0.8, 0, 0)
    expect(resolved.snapKind).toBe('edge');
    expect(resolved.point.x).toBeCloseTo(0.8, 1);
    expect(resolved.point.y).toBeCloseTo(0, 1);
  });

  it('prefers vertex over edge when both are within snap threshold', () => {
    // The vertex at (0,0,0) and the edge midpoint (0,1,0) — cursor at vertex (0,0,0)
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
    camera.position.set(0, 0, 5);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();

    const resolved = resolveMeasurementPick3D({
      intersection: createTestIntersection(),
      camera,
      rect: { left: 0, top: 0, width: 200, height: 200 },
      clientX: 100,
      clientY: 100,
      snapEnabled: true,
    });

    // Vertex (0,0,0) should win over any edge candidate at this cursor position
    expect(resolved.snapKind).toBe('vertex');
  });
});
