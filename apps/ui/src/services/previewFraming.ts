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

export interface PreviewAxisMetrics {
  axisExtent: number;
  minorStep: number;
  majorStep: number;
  labelStep: number;
  minorTickSize: number;
  majorTickSize: number;
  labelPrecision: number;
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

const DEFAULT_AXIS_METRICS: PreviewAxisMetrics = {
  axisExtent: 300,
  minorStep: DEFAULT_GRID_METRICS.cellSize,
  majorStep: DEFAULT_GRID_METRICS.sectionSize,
  labelStep: DEFAULT_GRID_METRICS.sectionSize,
  minorTickSize: 2,
  majorTickSize: 4,
  labelPrecision: 0,
};

export function buildModelFrameFromSourceBox(sourceBox: THREE.Box3, version: string): ModelFrame {
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

export function buildModelFrame(geometry: THREE.BufferGeometry, version: string): ModelFrame {
  geometry.computeBoundingBox();

  const sourceBox = geometry.boundingBox?.clone() ?? new THREE.Box3();
  return buildModelFrameFromSourceBox(sourceBox, version);
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

export function derivePreviewAxisMetrics(
  modelFrame: ModelFrame | null,
  gridMetrics: PreviewGridMetrics
): PreviewAxisMetrics {
  const footprint = modelFrame ? Math.max(modelFrame.size.x, modelFrame.size.z, 1) : 1;
  const axisExtent = roundUpToStep(
    Math.max(footprint * 0.75, gridMetrics.fadeDistance * 0.35, gridMetrics.sectionSize * 6),
    gridMetrics.sectionSize
  );
  const labelStepMultiplier = axisExtent / gridMetrics.sectionSize > 10 ? 2 : 1;
  const labelStep = gridMetrics.sectionSize * labelStepMultiplier;

  return {
    axisExtent:
      Number.isFinite(axisExtent) && axisExtent > 0 ? axisExtent : DEFAULT_AXIS_METRICS.axisExtent,
    minorStep: gridMetrics.cellSize,
    majorStep: gridMetrics.sectionSize,
    labelStep,
    minorTickSize: Math.max(gridMetrics.cellSize * 0.18, gridMetrics.sectionSize * 0.04),
    majorTickSize: Math.max(gridMetrics.cellSize * 0.4, gridMetrics.sectionSize * 0.08),
    labelPrecision: getStepPrecision(labelStep),
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

function roundUpToStep(value: number, step: number): number {
  if (!Number.isFinite(value) || value <= 0 || !Number.isFinite(step) || step <= 0) {
    return DEFAULT_AXIS_METRICS.axisExtent;
  }

  return Math.ceil(value / step) * step;
}

function getStepPrecision(step: number): number {
  if (!Number.isFinite(step) || step <= 0 || step >= 1) {
    return 0;
  }

  return Math.min(3, Math.ceil(-Math.log10(step)));
}
