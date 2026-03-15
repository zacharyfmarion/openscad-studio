import { clientToSvgPoint } from './viewportMath';
import type { MeasurementSnapTarget, SvgPoint, SvgViewportState } from './types';

interface MatrixLike {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
}

interface GeometryElementLike {
  tagName: string;
  getAttribute(name: string): string | null;
  getScreenCTM(): MatrixLike | null;
  getTotalLength?(): number;
  getPointAtLength?(distance: number): SvgPoint;
}

const GEOMETRY_SELECTOR = 'path, circle, ellipse, rect, polygon, polyline, line';
const PATH_SAMPLE_SPACING_PX = 6;
const PATH_MAX_SAMPLES = 400;

function parseNumber(value: string | null, fallback = 0) {
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parsePointList(value: string | null): SvgPoint[] {
  if (!value) {
    return [];
  }

  const numbers = value
    .trim()
    .split(/[\s,]+/)
    .map((part) => Number(part))
    .filter((part) => Number.isFinite(part));

  const points: SvgPoint[] = [];
  for (let index = 0; index + 1 < numbers.length; index += 2) {
    points.push({ x: numbers[index], y: numbers[index + 1] });
  }
  return points;
}

function distanceBetween(a: SvgPoint, b: SvgPoint) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function applyMatrix(point: SvgPoint, matrix: MatrixLike): SvgPoint {
  return {
    x: point.x * matrix.a + point.y * matrix.c + matrix.e,
    y: point.x * matrix.b + point.y * matrix.d + matrix.f,
  };
}

function closestPointOnSegment(point: SvgPoint, start: SvgPoint, end: SvgPoint): SvgPoint {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;

  if (lengthSquared <= 0) {
    return start;
  }

  const projection = ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared;
  const clamped = clamp(projection, 0, 1);

  return {
    x: start.x + dx * clamped,
    y: start.y + dy * clamped,
  };
}

function closestPointOnSegments(point: SvgPoint, points: SvgPoint[], closed: boolean): SvgPoint | null {
  if (points.length === 0) {
    return null;
  }

  if (points.length === 1) {
    return points[0];
  }

  let bestPoint: SvgPoint | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  const segmentCount = closed ? points.length : points.length - 1;

  for (let index = 0; index < segmentCount; index += 1) {
    const start = points[index];
    const end = points[(index + 1) % points.length];
    const candidate = closestPointOnSegment(point, start, end);
    const distance = distanceBetween(point, candidate);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestPoint = candidate;
    }
  }

  return bestPoint;
}

function closestPointOnCircle(point: SvgPoint, center: SvgPoint, radius: number): SvgPoint {
  const dx = point.x - center.x;
  const dy = point.y - center.y;
  const distance = Math.sqrt(dx * dx + dy * dy);

  if (distance <= 0 || !Number.isFinite(distance)) {
    return { x: center.x + radius, y: center.y };
  }

  return {
    x: center.x + (dx / distance) * radius,
    y: center.y + (dy / distance) * radius,
  };
}

function closestPointOnEllipse(point: SvgPoint, center: SvgPoint, rx: number, ry: number): SvgPoint {
  let bestPoint = { x: center.x + rx, y: center.y };
  let bestDistance = Number.POSITIVE_INFINITY;

  for (let index = 0; index < 96; index += 1) {
    const angle = (index / 96) * Math.PI * 2;
    const candidate = {
      x: center.x + Math.cos(angle) * rx,
      y: center.y + Math.sin(angle) * ry,
    };
    const distance = distanceBetween(point, candidate);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestPoint = candidate;
    }
  }

  return bestPoint;
}

function closestPointOnPath(
  element: GeometryElementLike,
  clientPoint: SvgPoint,
  viewportScale: number
): SvgPoint | null {
  if (typeof element.getTotalLength !== 'function' || typeof element.getPointAtLength !== 'function') {
    return null;
  }

  const matrix = element.getScreenCTM();
  if (!matrix) {
    return null;
  }

  const totalLength = element.getTotalLength();
  if (!Number.isFinite(totalLength) || totalLength <= 0) {
    return null;
  }

  const localSpacing = Math.max(0.25, PATH_SAMPLE_SPACING_PX / Math.max(viewportScale, 0.0001));
  const sampleCount = clamp(Math.ceil(totalLength / localSpacing), 8, PATH_MAX_SAMPLES);
  let bestLength = 0;
  let bestPoint = applyMatrix(element.getPointAtLength(0), matrix);
  let bestDistance = distanceBetween(clientPoint, bestPoint);

  for (let index = 1; index <= sampleCount; index += 1) {
    const length = (index / sampleCount) * totalLength;
    const candidate = applyMatrix(element.getPointAtLength(length), matrix);
    const distance = distanceBetween(clientPoint, candidate);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestLength = length;
      bestPoint = candidate;
    }
  }

  let step = totalLength / sampleCount;
  for (let iteration = 0; iteration < 6; iteration += 1) {
    const beforeLength = clamp(bestLength - step, 0, totalLength);
    const afterLength = clamp(bestLength + step, 0, totalLength);
    const beforePoint = applyMatrix(element.getPointAtLength(beforeLength), matrix);
    const afterPoint = applyMatrix(element.getPointAtLength(afterLength), matrix);
    const beforeDistance = distanceBetween(clientPoint, beforePoint);
    const afterDistance = distanceBetween(clientPoint, afterPoint);

    if (beforeDistance < bestDistance || afterDistance < bestDistance) {
      if (beforeDistance <= afterDistance) {
        bestDistance = beforeDistance;
        bestLength = beforeLength;
        bestPoint = beforePoint;
      } else {
        bestDistance = afterDistance;
        bestLength = afterLength;
        bestPoint = afterPoint;
      }
    }

    step /= 2;
  }

  return bestPoint;
}

export function getClosestGeometryClientPoint(
  element: GeometryElementLike,
  clientPoint: SvgPoint,
  viewportScale: number
): SvgPoint | null {
  if (typeof element.getScreenCTM !== 'function') {
    return null;
  }

  const matrix = element.getScreenCTM();
  if (!matrix) {
    return null;
  }

  const tagName = element.tagName.toLowerCase();

  if (tagName === 'line') {
    const localPoint = closestPointOnSegment(
      clientPoint,
      applyMatrix(
        {
          x: parseNumber(element.getAttribute('x1')),
          y: parseNumber(element.getAttribute('y1')),
        },
        matrix
      ),
      applyMatrix(
        {
          x: parseNumber(element.getAttribute('x2')),
          y: parseNumber(element.getAttribute('y2')),
        },
        matrix
      )
    );

    return localPoint;
  }

  if (tagName === 'rect') {
    const x = parseNumber(element.getAttribute('x'));
    const y = parseNumber(element.getAttribute('y'));
    const width = parseNumber(element.getAttribute('width'));
    const height = parseNumber(element.getAttribute('height'));

    const points = [
      applyMatrix({ x, y }, matrix),
      applyMatrix({ x: x + width, y }, matrix),
      applyMatrix({ x: x + width, y: y + height }, matrix),
      applyMatrix({ x, y: y + height }, matrix),
    ];

    return closestPointOnSegments(clientPoint, points, true);
  }

  if (tagName === 'polygon' || tagName === 'polyline') {
    const points = parsePointList(element.getAttribute('points')).map((point) =>
      applyMatrix(point, matrix)
    );
    return closestPointOnSegments(clientPoint, points, tagName === 'polygon');
  }

  if (tagName === 'circle') {
    const center = applyMatrix(
      {
        x: parseNumber(element.getAttribute('cx')),
        y: parseNumber(element.getAttribute('cy')),
      },
      matrix
    );
    const radiusPoint = applyMatrix(
      {
        x: parseNumber(element.getAttribute('cx')) + parseNumber(element.getAttribute('r')),
        y: parseNumber(element.getAttribute('cy')),
      },
      matrix
    );
    return closestPointOnCircle(clientPoint, center, distanceBetween(center, radiusPoint));
  }

  if (tagName === 'ellipse') {
    const center = applyMatrix(
      {
        x: parseNumber(element.getAttribute('cx')),
        y: parseNumber(element.getAttribute('cy')),
      },
      matrix
    );
    const rxPoint = applyMatrix(
      {
        x: parseNumber(element.getAttribute('cx')) + parseNumber(element.getAttribute('rx')),
        y: parseNumber(element.getAttribute('cy')),
      },
      matrix
    );
    const ryPoint = applyMatrix(
      {
        x: parseNumber(element.getAttribute('cx')),
        y: parseNumber(element.getAttribute('cy')) + parseNumber(element.getAttribute('ry')),
      },
      matrix
    );
    return closestPointOnEllipse(
      clientPoint,
      center,
      distanceBetween(center, rxPoint),
      distanceBetween(center, ryPoint)
    );
  }

  if (tagName === 'path') {
    return closestPointOnPath(element, clientPoint, viewportScale);
  }

  return null;
}

export function findClosestGeometrySnapTarget(args: {
  svgRoot: SVGSVGElement | null;
  clientPoint: SvgPoint;
  rect: Pick<DOMRect, 'left' | 'top'>;
  viewport: SvgViewportState;
  thresholdPx: number;
}): MeasurementSnapTarget | null {
  const { svgRoot, clientPoint, rect, viewport, thresholdPx } = args;

  if (!svgRoot) {
    return null;
  }

  const geometryElements = Array.from(
    svgRoot.querySelectorAll<SVGGraphicsElement>(GEOMETRY_SELECTOR)
  );

  let bestTarget: MeasurementSnapTarget | null = null;

  geometryElements.forEach((element, index) => {
    const closestClientPoint = getClosestGeometryClientPoint(
      element as unknown as GeometryElementLike,
      clientPoint,
      viewport.scale
    );

    if (!closestClientPoint) {
      return;
    }

    const screenDistance = distanceBetween(clientPoint, closestClientPoint);
    if (screenDistance > thresholdPx) {
      return;
    }

    const point = clientToSvgPoint(closestClientPoint.x, closestClientPoint.y, rect, viewport);
    const target: MeasurementSnapTarget = {
      id: `geometry-${index}`,
      point,
      kind: 'geometry',
      label: 'geometry',
      priority: 0,
      screenDistance,
    };

    if (!bestTarget || screenDistance < bestTarget.screenDistance) {
      bestTarget = target;
    }
  });

  return bestTarget;
}
