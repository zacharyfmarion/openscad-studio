import * as THREE from 'three';
import { getWorldNormalFromIntersection } from './selectionController';
import type { AxisLock, MeasurementRecord3D, MeasurementSnapKind } from './types';
import type { MeasurementUnit } from '../../stores/settingsStore';
import { formatWithUnit } from '../../utils/measurementUnits';

const SNAP_THRESHOLD_PX = 14;

export function createMeasurementId() {
  return `measurement3d_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function createMeasurementRecord3D(
  start: THREE.Vector3,
  end: THREE.Vector3,
  createdAt = Date.now()
): MeasurementRecord3D {
  const delta = end.clone().sub(start);
  return {
    id: createMeasurementId(),
    start: start.clone(),
    end: end.clone(),
    delta,
    distance: delta.length(),
    createdAt,
  };
}

export function getMeasurementMidpoint3D(measurement: { start: THREE.Vector3; end: THREE.Vector3 }) {
  return measurement.start.clone().add(measurement.end).multiplyScalar(0.5);
}

export function formatMeasurementSummary3D(
  measurement: { distance: number },
  unit: MeasurementUnit = 'mm'
) {
  return `Distance ${formatWithUnit(measurement.distance, unit)}`;
}

export function formatMeasurementDetail3D(
  measurement: { delta: THREE.Vector3 },
  unit: MeasurementUnit = 'mm'
) {
  return `dx ${formatWithUnit(measurement.delta.x, unit)}  dy ${formatWithUnit(measurement.delta.y, unit)}  dz ${formatWithUnit(measurement.delta.z, unit)}`;
}

export function applyAxisLock3D(
  start: THREE.Vector3,
  end: THREE.Vector3,
  preferredAxis: AxisLock = null
): { point: THREE.Vector3; axis: AxisLock } {
  const delta = end.clone().sub(start);
  const axis =
    preferredAxis ??
    (Math.abs(delta.x) >= Math.abs(delta.y) && Math.abs(delta.x) >= Math.abs(delta.z)
      ? 'x'
      : Math.abs(delta.y) >= Math.abs(delta.z)
        ? 'y'
        : 'z');

  const locked = start.clone();
  locked[axis] = end[axis];
  return { point: locked, axis };
}

function projectToScreen(
  point: THREE.Vector3,
  camera: THREE.Camera,
  rect: Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>
) {
  const projected = point.clone().project(camera);
  return {
    x: rect.left + ((projected.x + 1) / 2) * rect.width,
    y: rect.top + ((1 - projected.y) / 2) * rect.height,
  };
}

function screenDistance(
  point: THREE.Vector3,
  camera: THREE.Camera,
  rect: Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>,
  clientX: number,
  clientY: number
) {
  const screen = projectToScreen(point, camera, rect);
  return Math.hypot(screen.x - clientX, screen.y - clientY);
}

function getSnappedCandidates(
  intersection: THREE.Intersection<THREE.Object3D>
): Array<{ point: THREE.Vector3; kind: MeasurementSnapKind }> {
  const candidates: Array<{ point: THREE.Vector3; kind: MeasurementSnapKind }> = [
    { point: intersection.point.clone(), kind: 'surface' },
  ];

  if (!intersection.face || !(intersection.object instanceof THREE.Mesh)) {
    return candidates;
  }

  const geometry = intersection.object.geometry;
  const position = geometry.getAttribute('position');

  if (!position) {
    return candidates;
  }

  const localVertices = [intersection.face.a, intersection.face.b, intersection.face.c].map((index) =>
    new THREE.Vector3().fromBufferAttribute(position, index)
  );
  const worldVertices = localVertices.map((vertex) => vertex.applyMatrix4(intersection.object.matrixWorld));

  for (const vertex of worldVertices) {
    candidates.push({ point: vertex, kind: 'vertex' });
  }

  candidates.push(
    {
      point: worldVertices[0].clone().add(worldVertices[1]).multiplyScalar(0.5),
      kind: 'edge',
    },
    {
      point: worldVertices[1].clone().add(worldVertices[2]).multiplyScalar(0.5),
      kind: 'edge',
    },
    {
      point: worldVertices[2].clone().add(worldVertices[0]).multiplyScalar(0.5),
      kind: 'edge',
    }
  );

  return candidates;
}

export function resolveMeasurementPick3D(args: {
  intersection: THREE.Intersection<THREE.Object3D>;
  camera: THREE.Camera;
  rect: Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>;
  clientX: number;
  clientY: number;
  snapEnabled: boolean;
  lockAxis?: boolean;
  start?: THREE.Vector3 | null;
  preferredAxis?: AxisLock;
}) {
  const {
    intersection,
    camera,
    rect,
    clientX,
    clientY,
    snapEnabled,
    lockAxis = false,
    start = null,
    preferredAxis = null,
  } = args;

  const rankedCandidates = getSnappedCandidates(intersection)
    .map((candidate) => ({
      ...candidate,
      screenDistance: screenDistance(candidate.point, camera, rect, clientX, clientY),
    }))
    .sort((a, b) => {
      if (a.kind !== b.kind) {
        const priority = { vertex: 0, edge: 1, surface: 2 } satisfies Record<MeasurementSnapKind, number>;
        if (a.screenDistance <= SNAP_THRESHOLD_PX && b.screenDistance <= SNAP_THRESHOLD_PX) {
          return priority[a.kind] - priority[b.kind];
        }
      }

      return a.screenDistance - b.screenDistance;
    });

  const picked =
    snapEnabled && rankedCandidates[0] && rankedCandidates[0].screenDistance <= SNAP_THRESHOLD_PX
      ? rankedCandidates[0]
      : rankedCandidates.find((candidate) => candidate.kind === 'surface') ?? rankedCandidates[0];

  const point = picked.point.clone();
  const locked =
    lockAxis && start ? applyAxisLock3D(start, point, preferredAxis ?? null) : { point, axis: preferredAxis ?? null };

  return {
    point: locked.point,
    normal: getWorldNormalFromIntersection(intersection),
    snapKind: picked.kind,
    axisLock: locked.axis,
  };
}
