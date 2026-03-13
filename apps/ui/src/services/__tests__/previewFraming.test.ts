import * as THREE from 'three';
import { FALLBACK_PREVIEW_SCENE_STYLE } from '../previewSceneConfig';
import {
  MIN_VIEWPORT_FILL_RATIO,
  SIGNIFICANT_SHRINK_RATIO,
  VIEWPORT_PADDING_NDC,
  boxFitsCameraView,
  boxUnderfillsCameraView,
  buildModelFrame,
  derivePreviewFramingMetrics,
  derivePreviewGridMetrics,
} from '../previewFraming';

describe('previewFraming', () => {
  it('builds a stable model frame from geometry bounds', () => {
    const geometry = new THREE.BoxGeometry(10, 20, 30);

    const frame = buildModelFrame(geometry, 'frame-a');

    expect(frame.version).toBe('frame-a');
    expect(frame.size.x).toBeCloseTo(10);
    expect(frame.size.y).toBeCloseTo(30);
    expect(frame.size.z).toBeCloseTo(20);
    expect(frame.maxDim).toBe(30);
  });

  it('clamps zero-sized geometry to a tiny box', () => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0], 3));

    const frame = buildModelFrame(geometry, 'point');

    expect(frame.maxDim).toBeGreaterThan(0);
    expect(frame.box.isEmpty()).toBe(false);
  });

  it('scales framing metrics up for large models', () => {
    const box = new THREE.Box3().setFromCenterAndSize(
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(50, 50, 406.4)
    );

    const framing = derivePreviewFramingMetrics(box, FALLBACK_PREVIEW_SCENE_STYLE);

    expect(framing.fitDistance).toBeCloseTo(1016);
    expect(framing.maxDistance).toBeCloseTo(4064);
    expect(framing.cameraFar).toBeCloseTo(10160);
    expect(framing.fitPadding).toBeCloseTo(20.32);
  });

  it('keeps baseline caps for small models', () => {
    const box = new THREE.Box3().setFromCenterAndSize(
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(1, 1, 1)
    );

    const framing = derivePreviewFramingMetrics(box, FALLBACK_PREVIEW_SCENE_STYLE);

    expect(framing.minDistance).toBe(0.05);
    expect(framing.maxDistance).toBe(FALLBACK_PREVIEW_SCENE_STYLE.camera.baseMaxDistance);
    expect(framing.cameraFar).toBe(FALLBACK_PREVIEW_SCENE_STYLE.camera.baseFar);
  });

  it('detects when a box no longer fits the current camera view', () => {
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 1000);
    const box = new THREE.Box3().setFromCenterAndSize(
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(10, 10, 10)
    );

    camera.position.set(0, 0, 5);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();

    expect(boxFitsCameraView(camera, box, VIEWPORT_PADDING_NDC)).toBe(false);

    camera.position.set(0, 0, 30);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();

    expect(boxFitsCameraView(camera, box, VIEWPORT_PADDING_NDC)).toBe(true);
  });

  it('detects when a box underfills the current camera view', () => {
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 1000);
    const box = new THREE.Box3().setFromCenterAndSize(
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(10, 10, 10)
    );

    camera.position.set(0, 0, 80);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();

    expect(boxUnderfillsCameraView(camera, box, MIN_VIEWPORT_FILL_RATIO)).toBe(true);

    camera.position.set(0, 0, 18);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();

    expect(boxUnderfillsCameraView(camera, box, MIN_VIEWPORT_FILL_RATIO)).toBe(false);
  });

  it('scales grid metrics with the model footprint', () => {
    const modelFrame = {
      box: new THREE.Box3(),
      center: new THREE.Vector3(),
      size: new THREE.Vector3(120, 200, 90),
      maxDim: 200,
      version: 'grid-large',
    };

    const grid = derivePreviewGridMetrics(modelFrame);

    expect(grid.cellSize).toBe(10);
    expect(grid.sectionSize).toBe(50);
    expect(grid.fadeDistance).toBeGreaterThan(500);
  });

  it('uses a denser default grid for small models', () => {
    const modelFrame = {
      box: new THREE.Box3(),
      center: new THREE.Vector3(),
      size: new THREE.Vector3(18, 18, 18),
      maxDim: 18,
      version: 'grid-small',
    };

    const grid = derivePreviewGridMetrics(modelFrame);

    expect(grid.cellSize).toBe(2);
    expect(grid.sectionSize).toBe(10);
    expect(grid.fadeDistance).toBeGreaterThan(0);
  });

  it('treats large downscales as significant shrink events', () => {
    expect(40).toBeLessThan(100 * SIGNIFICANT_SHRINK_RATIO);
    expect(80).not.toBeLessThan(100 * SIGNIFICANT_SHRINK_RATIO);
  });
});
