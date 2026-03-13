import * as THREE from 'three';
import type { PreviewSceneStyle } from './previewSceneConfig';

const MODEL_ROTATION = new THREE.Matrix4().makeRotationX(-Math.PI / 2);
const MIN_MODEL_DIMENSION = 0.001;

export const VIEWPORT_PADDING_NDC = 0.02;
export const MIN_VIEWPORT_FILL_RATIO = 0.35;
export const SIGNIFICANT_SHRINK_RATIO = 0.7;

export interface ModelFrame {
  box: THREE.Box3;
  center: THREE.Vector3;
  size: THREE.Vector3;
  maxDim: number;
  version: string;
}

export interface PreviewFramingMetrics {
  fitDistance: number;
  minDistance: number;
  maxDistance: number;
  cameraFar: number;
  fitPadding: number;
}

export interface FitPaddingOptions {
  paddingTop: number;
  paddingRight: number;
  paddingBottom: number;
  paddingLeft: number;
}

export interface PreviewGridMetrics {
  cellSize: number;
  sectionSize: number;
  fadeDistance: number;
  cellThickness: number;
  sectionThickness: number;
}

export interface ProjectedBoxBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

const DEFAULT_GRID_METRICS: PreviewGridMetrics = {
  cellSize: 10,
  sectionSize: 50,
  fadeDistance: 500,
  cellThickness: 0.6,
  sectionThickness: 1.2,
};

export function buildModelFrame(geometry: THREE.BufferGeometry, version: string): ModelFrame {
  geometry.computeBoundingBox();

  const sourceBox = geometry.boundingBox?.clone() ?? new THREE.Box3();
  const rotatedBox = sourceBox.clone().applyMatrix4(MODEL_ROTATION);
  const center = rotatedBox.getCenter(new THREE.Vector3());
  const rawSize = rotatedBox.getSize(new THREE.Vector3());
  const size = new THREE.Vector3(
    Math.max(rawSize.x, MIN_MODEL_DIMENSION),
    Math.max(rawSize.y, MIN_MODEL_DIMENSION),
    Math.max(rawSize.z, MIN_MODEL_DIMENSION)
  );
  const box = new THREE.Box3().setFromCenterAndSize(center, size);

  return {
    box,
    center,
    size,
    maxDim: Math.max(size.x, size.y, size.z),
    version,
  };
}

export function derivePreviewFramingMetrics(
  box: THREE.Box3,
  sceneStyle: PreviewSceneStyle
): PreviewFramingMetrics {
  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z, MIN_MODEL_DIMENSION);
  const fitDistance = maxDim * sceneStyle.camera.frameDistanceMultiplier;

  return {
    fitDistance,
    minDistance: Math.max(0.05, maxDim * 0.01),
    maxDistance: Math.max(
      sceneStyle.camera.baseMaxDistance,
      fitDistance * sceneStyle.camera.maxDistanceMultiplier
    ),
    cameraFar: Math.max(
      sceneStyle.camera.baseFar,
      fitDistance * sceneStyle.camera.farMultiplier,
      sceneStyle.camera.near + 1
    ),
    fitPadding: maxDim * sceneStyle.camera.fitPaddingRatio,
  };
}

export function getFitPaddingOptions(
  box: THREE.Box3,
  sceneStyle: PreviewSceneStyle
): FitPaddingOptions {
  const framing = derivePreviewFramingMetrics(box, sceneStyle);

  return {
    paddingTop: framing.fitPadding,
    paddingRight: framing.fitPadding,
    paddingBottom: framing.fitPadding * 2,
    paddingLeft: framing.fitPadding,
  };
}

export function getExpandedFitBox(box: THREE.Box3, sceneStyle: PreviewSceneStyle): THREE.Box3 {
  const framing = derivePreviewFramingMetrics(box, sceneStyle);
  const expandedBox = box.clone();

  expandedBox.expandByVector(
    new THREE.Vector3(framing.fitPadding, framing.fitPadding, framing.fitPadding)
  );
  expandedBox.min.y -= framing.fitPadding;

  return expandedBox;
}

export function boxFitsCameraView(
  camera: THREE.Camera,
  box: THREE.Box3,
  paddingNdc = VIEWPORT_PADDING_NDC
): boolean {
  if (box.isEmpty()) {
    return true;
  }

  camera.updateMatrixWorld();

  if (camera instanceof THREE.PerspectiveCamera || camera instanceof THREE.OrthographicCamera) {
    camera.updateProjectionMatrix();
  }

  const projectedBounds = getProjectedBoxBounds(camera, box);

  if (!projectedBounds) {
    return false;
  }

  if (projectedBounds.minX < -1 + paddingNdc || projectedBounds.maxX > 1 - paddingNdc) {
    return false;
  }

  if (projectedBounds.minY < -1 + paddingNdc || projectedBounds.maxY > 1 - paddingNdc) {
    return false;
  }

  for (const corner of getBoxCorners(box)) {
    const projected = corner.project(camera);

    if (
      !Number.isFinite(projected.x) ||
      !Number.isFinite(projected.y) ||
      !Number.isFinite(projected.z)
    ) {
      return false;
    }

    if (projected.z < -1 || projected.z > 1) {
      return false;
    }
  }

  return true;
}

export function boxUnderfillsCameraView(
  camera: THREE.Camera,
  box: THREE.Box3,
  minFillRatio = MIN_VIEWPORT_FILL_RATIO
): boolean {
  const projectedBounds = getProjectedBoxBounds(camera, box);

  if (!projectedBounds) {
    return false;
  }

  const width = projectedBounds.maxX - projectedBounds.minX;
  const height = projectedBounds.maxY - projectedBounds.minY;
  const dominantSpan = Math.max(width, height);

  return dominantSpan < minFillRatio * 2;
}

export function derivePreviewGridMetrics(modelFrame: ModelFrame | null): PreviewGridMetrics {
  if (!modelFrame) {
    return DEFAULT_GRID_METRICS;
  }

  const footprint = Math.max(modelFrame.size.x, modelFrame.size.z);
  const referenceSpan = Math.max(footprint, modelFrame.maxDim * 0.5, 1);
  const cellSize = niceGridStep(referenceSpan / 12);
  const sectionSize = cellSize * 5;

  return {
    cellSize,
    sectionSize,
    fadeDistance: Math.max(sectionSize * 12, referenceSpan * 8),
    cellThickness: 0.6,
    sectionThickness: 1.2,
  };
}

function getBoxCorners(box: THREE.Box3): THREE.Vector3[] {
  const { min, max } = box;

  return [
    new THREE.Vector3(min.x, min.y, min.z),
    new THREE.Vector3(min.x, min.y, max.z),
    new THREE.Vector3(min.x, max.y, min.z),
    new THREE.Vector3(min.x, max.y, max.z),
    new THREE.Vector3(max.x, min.y, min.z),
    new THREE.Vector3(max.x, min.y, max.z),
    new THREE.Vector3(max.x, max.y, min.z),
    new THREE.Vector3(max.x, max.y, max.z),
  ];
}

function getProjectedBoxBounds(camera: THREE.Camera, box: THREE.Box3): ProjectedBoxBounds | null {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (const corner of getBoxCorners(box)) {
    const projected = corner.project(camera);

    if (!Number.isFinite(projected.x) || !Number.isFinite(projected.y)) {
      return null;
    }

    minX = Math.min(minX, projected.x);
    maxX = Math.max(maxX, projected.x);
    minY = Math.min(minY, projected.y);
    maxY = Math.max(maxY, projected.y);
  }

  return { minX, maxX, minY, maxY };
}

function niceGridStep(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return DEFAULT_GRID_METRICS.cellSize;
  }

  const exponent = Math.floor(Math.log10(value));
  const magnitude = 10 ** exponent;
  const normalized = value / magnitude;

  if (normalized <= 1) {
    return magnitude;
  }

  if (normalized <= 2) {
    return 2 * magnitude;
  }

  if (normalized <= 5) {
    return 5 * magnitude;
  }

  return 10 * magnitude;
}
