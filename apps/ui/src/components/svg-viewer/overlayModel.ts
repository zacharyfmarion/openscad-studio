import {
  formatMeasurementReadout,
  getDraftMeasurementPreview,
  getMeasurementMidpoint,
} from './measurementController';
import { getVisibleDocumentBounds } from './viewportMath';
import type {
  CommittedMeasurement,
  MeasurementDraft,
  OverlayCircle,
  OverlayLabel,
  OverlayLine,
  OverlayModel,
  OverlayMeasurement,
  OverlayRect,
  SvgBounds,
  SvgViewportState,
  ViewerOverlaySettings,
} from './types';

function formatNumber(value: number): string {
  if (!Number.isFinite(value)) {
    return '0';
  }

  const rounded = Math.abs(value) >= 100 ? value.toFixed(1) : value.toFixed(2);
  return rounded.replace(/\.00$/, '').replace(/(\.\d)0$/, '$1');
}

function makeLine(
  key: string,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  tone: OverlayLine['tone']
): OverlayLine {
  return { key, x1, y1, x2, y2, tone };
}

export function getAdaptiveGridSpacing(scale: number): { majorStep: number; minorStep: number } {
  const targetPixels = 96;
  const roughStep = targetPixels / Math.max(scale, 0.0001);
  const power = Math.pow(10, Math.floor(Math.log10(Math.max(roughStep, 0.0001))));
  const normalized = roughStep / power;

  let step = power;
  if (normalized > 5) {
    step = 10 * power;
  } else if (normalized > 2) {
    step = 5 * power;
  } else if (normalized > 1) {
    step = 2 * power;
  }

  return {
    majorStep: step,
    minorStep: step / 5,
  };
}

function buildGridLines(
  tone: 'minor' | 'major',
  step: number,
  visibleBounds: SvgBounds,
  hardLimit: number
): OverlayLine[] {
  if (!Number.isFinite(step) || step <= 0) {
    return [];
  }

  const lineCountEstimate =
    Math.ceil(visibleBounds.width / step) + Math.ceil(visibleBounds.height / step) + 2;
  if (lineCountEstimate > hardLimit) {
    return [];
  }

  const lines: OverlayLine[] = [];
  const minX = Math.floor(visibleBounds.minX / step) * step;
  const maxX = visibleBounds.minX + visibleBounds.width;
  const minY = Math.floor(visibleBounds.minY / step) * step;
  const maxY = visibleBounds.minY + visibleBounds.height;

  for (let x = minX; x <= maxX; x += step) {
    lines.push(makeLine(`${tone}-vx-${x}`, x, minY, x, maxY, tone));
  }

  for (let y = minY; y <= maxY; y += step) {
    lines.push(makeLine(`${tone}-hy-${y}`, minX, y, maxX, y, tone));
  }

  return lines;
}

function buildBoundsLabels(bounds: SvgBounds): OverlayLabel[] {
  return [
    {
      key: 'bounds-width',
      x: bounds.minX + bounds.width / 2,
      y: bounds.minY + 10,
      text: `${formatNumber(bounds.width)}w`,
      tone: 'bounds',
      anchor: 'middle',
    },
    {
      key: 'bounds-height',
      x: bounds.minX + 10,
      y: bounds.minY + bounds.height / 2,
      text: `${formatNumber(bounds.height)}h`,
      tone: 'bounds',
      anchor: 'start',
    },
  ];
}

function makeCircle(
  key: string,
  cx: number,
  cy: number,
  r: number,
  tone: OverlayCircle['tone']
): OverlayCircle {
  return { key, cx, cy, r, tone };
}

function buildMeasurementOverlay(args: {
  measurement: CommittedMeasurement;
  selected: boolean;
  scale: number;
}): OverlayMeasurement {
  const { measurement, selected, scale } = args;
  const midpoint = getMeasurementMidpoint(measurement);
  const text = formatMeasurementReadout(measurement);
  const fontSize = 12 / Math.max(scale, 0.0001);
  const estimatedWidth = Math.max(text.length * fontSize * 0.62, 84 / Math.max(scale, 0.0001));
  const boxHeight = fontSize * 1.8;
  const labelCenterY = midpoint.y - 14 / Math.max(scale, 0.0001);

  return {
    id: measurement.id,
    line: makeLine(
      `measurement-line-${measurement.id}`,
      measurement.start.x,
      measurement.start.y,
      measurement.end.x,
      measurement.end.y,
      'measure'
    ),
    label: {
      key: `measurement-label-${measurement.id}`,
      x: midpoint.x,
      y: labelCenterY,
      text,
      tone: 'measure',
      anchor: 'middle',
    },
    labelBox: {
      key: `measurement-label-box-${measurement.id}`,
      x: midpoint.x - estimatedWidth / 2,
      y: labelCenterY - boxHeight / 2,
      width: estimatedWidth,
      height: boxHeight,
    },
    startMarker: makeCircle(
      `measurement-start-${measurement.id}`,
      measurement.start.x,
      measurement.start.y,
      (selected ? 5 : 4) / Math.max(scale, 0.0001),
      selected ? 'measure-selected' : 'measure'
    ),
    endMarker: makeCircle(
      `measurement-end-${measurement.id}`,
      measurement.end.x,
      measurement.end.y,
      (selected ? 5 : 4) / Math.max(scale, 0.0001),
      selected ? 'measure-selected' : 'measure'
    ),
    selected,
  };
}

export function buildOverlayModel(args: {
  bounds: SvgBounds;
  viewport: SvgViewportState;
  containerWidth: number;
  containerHeight: number;
  settings: ViewerOverlaySettings;
  draftMeasurement: MeasurementDraft;
  measurements: CommittedMeasurement[];
  selectedMeasurementId: string | null;
}): OverlayModel {
  const {
    bounds,
    viewport,
    containerWidth,
    containerHeight,
    settings,
    draftMeasurement,
    measurements,
    selectedMeasurementId,
  } = args;
  const visibleBounds = getVisibleDocumentBounds(viewport, containerWidth, containerHeight);
  const gridSpacing = getAdaptiveGridSpacing(viewport.scale);

  const axesLines = settings.showAxes
    ? [
        makeLine(
          'axis-x',
          visibleBounds.minX,
          0,
          visibleBounds.minX + visibleBounds.width,
          0,
          'axis-x'
        ),
        makeLine(
          'axis-y',
          0,
          visibleBounds.minY,
          0,
          visibleBounds.minY + visibleBounds.height,
          'axis-y'
        ),
      ]
    : [];

  const boundsRect: OverlayRect | null = settings.showBounds
    ? {
        key: 'drawing-bounds',
        x: bounds.minX,
        y: bounds.minY,
        width: bounds.width,
        height: bounds.height,
      }
    : null;

  const draftPreview = getDraftMeasurementPreview(draftMeasurement);
  const draftMeasurementLine = draftPreview
    ? makeLine(
        'draft-measurement-line',
        draftPreview.start.x,
        draftPreview.start.y,
        draftPreview.end.x,
        draftPreview.end.y,
        'measure'
      )
    : null;
  const draftMeasurementLabel = draftPreview
    ? {
        key: 'draft-measurement-label',
        x: draftPreview.midpoint.x,
        y: draftPreview.midpoint.y - 10 / Math.max(viewport.scale, 0.0001),
        text: draftPreview.readout,
        tone: 'measure' as const,
        anchor: 'middle' as const,
      }
    : null;
  const draftMeasurementMarkers: OverlayCircle[] = [];
  if (draftMeasurement.start) {
    draftMeasurementMarkers.push(
      makeCircle(
        'draft-measurement-start',
        draftMeasurement.start.x,
        draftMeasurement.start.y,
        4 / Math.max(viewport.scale, 0.0001),
        'measure'
      )
    );
  }
  if (draftMeasurement.current && draftMeasurement.status === 'placing-end') {
    draftMeasurementMarkers.push(
      makeCircle(
        'draft-measurement-current',
        draftMeasurement.current.x,
        draftMeasurement.current.y,
        4 / Math.max(viewport.scale, 0.0001),
        'measure'
      )
    );
  }

  const draftSnapIndicator = draftMeasurement.snappedTarget
    ? makeCircle(
        `draft-snap-${draftMeasurement.snappedTarget.id}`,
        draftMeasurement.snappedTarget.point.x,
        draftMeasurement.snappedTarget.point.y,
        7 / Math.max(viewport.scale, 0.0001),
        'snap'
      )
    : null;
  const draftSnapLabel = draftMeasurement.snappedTarget
    ? {
        key: `draft-snap-label-${draftMeasurement.snappedTarget.id}`,
        x: draftMeasurement.snappedTarget.point.x,
        y: draftMeasurement.snappedTarget.point.y - 12 / Math.max(viewport.scale, 0.0001),
        text: `Snap: ${draftMeasurement.snappedTarget.label}`,
        tone: 'measure' as const,
        anchor: 'middle' as const,
      }
    : null;

  const committedMeasurements = measurements.map((measurement) =>
    buildMeasurementOverlay({
      measurement,
      selected: measurement.id === selectedMeasurementId,
      scale: viewport.scale,
    })
  );

  return {
    majorGridLines: settings.showGrid
      ? buildGridLines('major', gridSpacing.majorStep, visibleBounds, 320)
      : [],
    minorGridLines:
      settings.showGrid && viewport.scale >= 0.5
        ? buildGridLines('minor', gridSpacing.minorStep, visibleBounds, 520)
        : [],
    axesLines,
    boundsRect,
    boundsLabels: settings.showBounds ? buildBoundsLabels(bounds) : [],
    origin: settings.showOrigin ? { x: 0, y: 0 } : null,
    draftMeasurementLine,
    draftMeasurementLabel,
    draftMeasurementMarkers,
    draftSnapIndicator,
    draftSnapLabel,
    committedMeasurements,
    gridStep: gridSpacing.majorStep,
  };
}
