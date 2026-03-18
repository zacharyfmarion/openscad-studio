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
});
