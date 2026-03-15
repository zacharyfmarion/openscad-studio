import type {
  CommittedMeasurement,
  MeasurementDraft,
  MeasurementSnapTarget,
  SvgBounds,
  SvgPoint,
  SvgViewportState,
} from './types';
import { findClosestGeometrySnapTarget } from './geometrySnap';
import { svgToClientPoint } from './viewportMath';

const SNAP_THRESHOLD_PX = 12;
const SNAP_PRIORITY_DISTANCE_LEEWAY_PX = 4;
const ANGLE_LOCK_INCREMENT_DEGREES = 15;

function formatNumber(value: number): string {
  if (!Number.isFinite(value)) {
    return '0';
  }

  const rounded = Math.abs(value) >= 100 ? value.toFixed(1) : value.toFixed(2);
  return rounded.replace(/\.00$/, '').replace(/(\.\d)0$/, '$1');
}

function midpoint(a: SvgPoint, b: SvgPoint): SvgPoint {
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
  };
}

function distanceBetween(a: SvgPoint, b: SvgPoint) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

export function applyAngleLock(
  start: SvgPoint,
  end: SvgPoint,
  incrementDegrees = ANGLE_LOCK_INCREMENT_DEGREES
): SvgPoint {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const distance = Math.sqrt(dx * dx + dy * dy);

  if (!Number.isFinite(distance) || distance <= 0) {
    return end;
  }

  const incrementRadians = (incrementDegrees * Math.PI) / 180;
  const angle = Math.atan2(dy, dx);
  const lockedAngle = Math.round(angle / incrementRadians) * incrementRadians;

  return {
    x: start.x + Math.cos(lockedAngle) * distance,
    y: start.y + Math.sin(lockedAngle) * distance,
  };
}

export function createMeasurementId() {
  return `measurement_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function createCommittedMeasurement(
  start: SvgPoint,
  end: SvgPoint,
  createdAt = Date.now()
): CommittedMeasurement {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const distance = Math.sqrt(dx * dx + dy * dy);

  return {
    id: createMeasurementId(),
    start,
    end,
    dx,
    dy,
    distance,
    createdAt,
  };
}

export function formatMeasurementReadout(measurement: { start: SvgPoint; end: SvgPoint }) {
  const dx = measurement.end.x - measurement.start.x;
  const dy = measurement.end.y - measurement.start.y;
  const distance = Math.sqrt(dx * dx + dy * dy);

  return `Distance ${formatNumber(distance)} mm`;
}

export function getMeasurementMidpoint(measurement: { start: SvgPoint; end: SvgPoint }) {
  return midpoint(measurement.start, measurement.end);
}

export function buildMeasurementSnapTargets(args: {
  bounds: SvgBounds;
  point: SvgPoint;
  gridStep: number | null;
}): MeasurementSnapTarget[] {
  const { bounds, point, gridStep } = args;
  const maxX = bounds.minX + bounds.width;
  const maxY = bounds.minY + bounds.height;

  const targets: MeasurementSnapTarget[] = [
    {
      id: 'origin',
      point: { x: 0, y: 0 },
      kind: 'origin',
      label: 'origin',
      priority: 1,
      screenDistance: Number.POSITIVE_INFINITY,
    },
    {
      id: 'corner-top-left',
      point: { x: bounds.minX, y: bounds.minY },
      kind: 'bounds-corner',
      label: 'corner',
      priority: 2,
      screenDistance: Number.POSITIVE_INFINITY,
    },
    {
      id: 'corner-top-right',
      point: { x: maxX, y: bounds.minY },
      kind: 'bounds-corner',
      label: 'corner',
      priority: 2,
      screenDistance: Number.POSITIVE_INFINITY,
    },
    {
      id: 'corner-bottom-left',
      point: { x: bounds.minX, y: maxY },
      kind: 'bounds-corner',
      label: 'corner',
      priority: 2,
      screenDistance: Number.POSITIVE_INFINITY,
    },
    {
      id: 'corner-bottom-right',
      point: { x: maxX, y: maxY },
      kind: 'bounds-corner',
      label: 'corner',
      priority: 2,
      screenDistance: Number.POSITIVE_INFINITY,
    },
    {
      id: 'mid-top',
      point: { x: bounds.minX + bounds.width / 2, y: bounds.minY },
      kind: 'bounds-midpoint',
      label: 'edge midpoint',
      priority: 3,
      screenDistance: Number.POSITIVE_INFINITY,
    },
    {
      id: 'mid-right',
      point: { x: maxX, y: bounds.minY + bounds.height / 2 },
      kind: 'bounds-midpoint',
      label: 'edge midpoint',
      priority: 3,
      screenDistance: Number.POSITIVE_INFINITY,
    },
    {
      id: 'mid-bottom',
      point: { x: bounds.minX + bounds.width / 2, y: maxY },
      kind: 'bounds-midpoint',
      label: 'edge midpoint',
      priority: 3,
      screenDistance: Number.POSITIVE_INFINITY,
    },
    {
      id: 'mid-left',
      point: { x: bounds.minX, y: bounds.minY + bounds.height / 2 },
      kind: 'bounds-midpoint',
      label: 'edge midpoint',
      priority: 3,
      screenDistance: Number.POSITIVE_INFINITY,
    },
  ];

  if (gridStep && Number.isFinite(gridStep) && gridStep > 0) {
    targets.push({
      id: `grid-${Math.round(point.x / gridStep)}-${Math.round(point.y / gridStep)}`,
      point: {
        x: Math.round(point.x / gridStep) * gridStep,
        y: Math.round(point.y / gridStep) * gridStep,
      },
      kind: 'grid',
      label: 'grid',
      priority: 4,
      screenDistance: Number.POSITIVE_INFINITY,
    });
  }

  return targets;
}

export function chooseMeasurementSnapTarget(args: {
  point: SvgPoint;
  targets: MeasurementSnapTarget[];
  viewport: SvgViewportState;
  rect: Pick<DOMRect, 'left' | 'top'>;
  thresholdPx?: number;
}): MeasurementSnapTarget | null {
  const { point, targets, viewport, rect, thresholdPx = SNAP_THRESHOLD_PX } = args;
  const pointClient = svgToClientPoint(point, rect, viewport);

  const ranked = targets
    .map((target) => {
      const targetClient = svgToClientPoint(target.point, rect, viewport);
      const dx = targetClient.x - pointClient.x;
      const dy = targetClient.y - pointClient.y;
      return {
        ...target,
        screenDistance: Math.sqrt(dx * dx + dy * dy),
      };
    })
    .filter((target) => target.screenDistance <= thresholdPx)
    .sort((a, b) => {
      const distanceDelta = Math.abs(a.screenDistance - b.screenDistance);
      if (distanceDelta <= SNAP_PRIORITY_DISTANCE_LEEWAY_PX && a.priority !== b.priority) {
        return a.priority - b.priority;
      }

      if (a.screenDistance !== b.screenDistance) {
        return a.screenDistance - b.screenDistance;
      }

      return a.priority - b.priority;
    });

  return ranked[0] ?? null;
}

export function resolveMeasurementPlacement(args: {
  rawPoint: SvgPoint;
  clientPoint: SvgPoint;
  bounds: SvgBounds;
  gridStep: number | null;
  viewport: SvgViewportState;
  rect: Pick<DOMRect, 'left' | 'top'>;
  svgRoot: SVGSVGElement | null;
  includeGridSnap: boolean;
  draftStart?: SvgPoint | null;
  lockAngle?: boolean;
}) {
  const {
    rawPoint,
    clientPoint,
    bounds,
    gridStep,
    viewport,
    rect,
    svgRoot,
    includeGridSnap,
    draftStart = null,
    lockAngle = false,
  } = args;
  const geometryTarget = findClosestGeometrySnapTarget({
    svgRoot,
    clientPoint,
    rect,
    viewport,
    thresholdPx: SNAP_THRESHOLD_PX,
  });

  const targets = buildMeasurementSnapTargets({
    bounds,
    point: rawPoint,
    gridStep: includeGridSnap ? gridStep : null,
  });
  const snappedTarget = chooseMeasurementSnapTarget({
    point: rawPoint,
    targets: geometryTarget ? [geometryTarget, ...targets] : targets,
    viewport,
    rect,
  });
  const basePoint = snappedTarget?.point ?? rawPoint;
  const constrainedPoint =
    lockAngle && draftStart ? applyAngleLock(draftStart, basePoint) : basePoint;
  const constrainedSnapTarget =
    snappedTarget && distanceBetween(snappedTarget.point, constrainedPoint) < 0.001
      ? snappedTarget
      : null;

  return {
    point: constrainedPoint,
    snappedTarget: constrainedSnapTarget,
  };
}

export function getDraftMeasurementPreview(draft: MeasurementDraft) {
  if (draft.status !== 'placing-end' || !draft.start || !draft.current) {
    return null;
  }

  return {
    start: draft.start,
    end: draft.current,
    midpoint: midpoint(draft.start, draft.current),
    readout: formatMeasurementReadout({
      start: draft.start,
      end: draft.current,
    }),
  };
}

export function isDraftMeasurementActive(draft: MeasurementDraft) {
  return draft.status === 'placing-end' && !!draft.start;
}

export function getMeasurementSelectionDistance(
  measurement: CommittedMeasurement,
  point: SvgPoint
) {
  const center = midpoint(measurement.start, measurement.end);
  return distanceBetween(center, point);
}
