import type {
  AnnotationShape,
  AnnotationTool,
  DraftAnnotation,
  NormalizedPoint,
  ViewerSurfaceSize,
} from './types';
import { createRandomId } from '../../utils/randomId';

const MIN_DRAG_DISTANCE = 0.004;
const MIN_FREEHAND_POINT_DELTA = 0.002;

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

export function normalizeViewerPoint(
  point: { x: number; y: number },
  surface: ViewerSurfaceSize
): NormalizedPoint {
  const safeWidth = Math.max(surface.width, 1);
  const safeHeight = Math.max(surface.height, 1);
  return {
    x: clamp01(point.x / safeWidth),
    y: clamp01(point.y / safeHeight),
  };
}

export function denormalizeViewerPoint(
  point: NormalizedPoint,
  surface: ViewerSurfaceSize
): { x: number; y: number } {
  return {
    x: clamp01(point.x) * Math.max(surface.width, 1),
    y: clamp01(point.y) * Math.max(surface.height, 1),
  };
}

function pointDistance(a: NormalizedPoint, b: NormalizedPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function createDraftAnnotation(
  tool: AnnotationTool,
  start: NormalizedPoint
): DraftAnnotation {
  return {
    id: createRandomId(),
    tool,
    start,
    current: start,
    points: tool === 'freehand' ? [start] : [start],
  };
}

export function updateDraftAnnotation(
  draft: DraftAnnotation,
  nextPoint: NormalizedPoint
): DraftAnnotation {
  if (draft.tool !== 'freehand') {
    return {
      ...draft,
      current: nextPoint,
    };
  }

  const lastPoint = draft.points[draft.points.length - 1];
  if (lastPoint && pointDistance(lastPoint, nextPoint) < MIN_FREEHAND_POINT_DELTA) {
    return {
      ...draft,
      current: nextPoint,
    };
  }

  return {
    ...draft,
    current: nextPoint,
    points: [...draft.points, nextPoint],
  };
}

export function draftToAnnotationShape(draft: DraftAnnotation): AnnotationShape | null {
  if (draft.tool === 'freehand') {
    if (draft.points.length < 2) {
      return null;
    }

    return {
      id: draft.id,
      kind: 'freehand',
      points: draft.points,
    };
  }

  if (pointDistance(draft.start, draft.current) < MIN_DRAG_DISTANCE) {
    return null;
  }

  if (draft.tool === 'oval') {
    return {
      id: draft.id,
      kind: 'oval',
      start: draft.start,
      end: draft.current,
    };
  }

  return {
    id: draft.id,
    kind: 'box',
    start: draft.start,
    end: draft.current,
  };
}

export function getAnnotationBounds(shape: AnnotationShape) {
  if (shape.kind === 'freehand') {
    const xs = shape.points.map((point) => point.x);
    const ys = shape.points.map((point) => point.y);
    return {
      x: Math.min(...xs),
      y: Math.min(...ys),
      width: Math.max(...xs) - Math.min(...xs),
      height: Math.max(...ys) - Math.min(...ys),
    };
  }

  return {
    x: Math.min(shape.start.x, shape.end.x),
    y: Math.min(shape.start.y, shape.end.y),
    width: Math.abs(shape.end.x - shape.start.x),
    height: Math.abs(shape.end.y - shape.start.y),
  };
}

export function isAnnotationRenderable(shape: AnnotationShape): boolean {
  const bounds = getAnnotationBounds(shape);
  if (shape.kind === 'freehand') {
    return shape.points.length >= 2 && (bounds.width > 0 || bounds.height > 0);
  }

  return bounds.width >= MIN_DRAG_DISTANCE || bounds.height >= MIN_DRAG_DISTANCE;
}

export function getExportScale(surface: ViewerSurfaceSize, maxEdge: number, pixelRatio: number) {
  const safeWidth = Math.max(surface.width, 1);
  const safeHeight = Math.max(surface.height, 1);
  const clampedPixelRatio = Math.max(pixelRatio, 1);
  const targetRatio = Math.min(clampedPixelRatio, maxEdge / Math.max(safeWidth, safeHeight));

  return Math.max(targetRatio, 0.25);
}
