/** @jest-environment jsdom */

import { buildOverlayModel, getAdaptiveGridSpacing } from '../svg-viewer/overlayModel';
import { parseSvgMetrics } from '../svg-viewer/parseSvgMetrics';
import {
  chooseMeasurementSnapTarget,
  createCommittedMeasurement,
  getDraftMeasurementPreview,
  resolveMeasurementPlacement,
} from '../svg-viewer/measurementController';
import {
  actualSizeViewport,
  clientToSvgPoint,
  fitViewportToBounds,
  getVisibleDocumentBounds,
  svgToClientPoint,
} from '../svg-viewer/viewportMath';
import type { MeasurementDraft, ViewerOverlaySettings } from '../svg-viewer/types';

const defaultSettings: ViewerOverlaySettings = {
  showAxes: true,
  showGrid: true,
  showOrigin: true,
  showBounds: true,
  showCursorCoords: true,
  enableGridSnap: true,
};

const idleDraft: MeasurementDraft = {
  status: 'idle',
  start: null,
  current: null,
  snappedTarget: null,
};

describe('svg viewer helpers', () => {
  it('parses valid SVG metrics and preserves geometry styling', () => {
    const parsed = parseSvgMetrics(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 10">
        <rect x="0" y="0" width="20" height="10" fill="#123456" stroke="#000000" stroke-width="1" />
      </svg>
    `);

    expect(parsed.metrics.viewBox).toEqual({ minX: 0, minY: 0, width: 20, height: 10 });
    expect(parsed.metrics.normalizedViewBox).toEqual({ minX: 0, minY: 0, width: 20, height: 10 });
    expect(parsed.metrics.documentOrigin).toEqual({ x: 0, y: 0 });
    expect(parsed.metrics.isEmpty).toBe(false);
    expect(parsed.markup).toContain('fill="#123456"');
    expect(parsed.markup).toContain('width="20"');
    expect(parsed.markup).toContain('vector-effect="non-scaling-stroke"');
    expect(parsed.markup).toContain('stroke-width="1.15"');
    expect(parsed.markup).not.toContain('data-viewer-stroke-normalization="true"');
  });

  it('replaces the default OpenSCAD fill with the provided theme color', () => {
    const parsed = parseSvgMetrics(
      `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 10">
          <path d="M 0,0 L 20,0 L 20,10 z" fill="lightgray" stroke="#000000" />
        </svg>
      `,
      {
        defaultFillColor: '#2aa198',
      }
    );

    expect(parsed.markup).toContain('fill="#2aa198"');
    expect(parsed.markup).not.toContain('fill="lightgray"');
  });

  it('replaces the desktop native default outline-only style with the provided theme fill', () => {
    const parsed = parseSvgMetrics(
      `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="-1 -21 22 22">
          <path d="M 0,-0 L 20,-0 L 20,-20 L 0,-20 z" stroke="black" fill="none" stroke-width="0.35" />
        </svg>
      `,
      {
        defaultFillColor: '#2aa198',
      }
    );

    expect(parsed.markup).toContain('fill="#2aa198"');
    expect(parsed.markup).toContain('stroke="black"');
    expect(parsed.markup).not.toContain('fill="none"');
  });

  it('keeps explicit non-default style fills intact when a theme fill is provided', () => {
    const parsed = parseSvgMetrics(
      `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 10">
          <rect x="0" y="0" width="20" height="10" style="fill:#123456;stroke:#000000" />
        </svg>
      `,
      {
        defaultFillColor: '#2aa198',
      }
    );

    expect(parsed.markup).toContain('style="fill:#123456;stroke:#000000"');
    expect(parsed.markup).not.toContain('fill="#2aa198"');
  });

  it('keeps explicit outline-only styling intact when the stroke is non-default', () => {
    const parsed = parseSvgMetrics(
      `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 10">
          <path d="M 0,0 L 20,0 L 20,10 z" fill="none" stroke="#ff0000" />
        </svg>
      `,
      {
        defaultFillColor: '#2aa198',
      }
    );

    expect(parsed.markup).toContain('fill="none"');
    expect(parsed.markup).toContain('stroke="#ff0000"');
    expect(parsed.markup).not.toContain('fill="#2aa198"');
  });

  it('falls back to width and height when viewBox is missing', () => {
    const parsed = parseSvgMetrics(`
      <svg xmlns="http://www.w3.org/2000/svg" width="48" height="24">
        <rect x="0" y="0" width="48" height="24" />
      </svg>
    `);

    expect(parsed.metrics.viewBox).toEqual({ minX: 0, minY: 0, width: 48, height: 24 });
    expect(parsed.metrics.warnings[0]).toMatch(/did not include a valid viewBox/i);
  });

  it('throws for malformed SVG input', () => {
    expect(() => parseSvgMetrics('<svg><g></svg')).toThrow(/parse svg/i);
  });

  it('builds adaptive grid, bounds, draft, and committed measurement overlays', () => {
    const viewport = fitViewportToBounds({ minX: 0, minY: 0, width: 40, height: 20 }, 400, 300);
    const committed = createCommittedMeasurement({ x: 0, y: 0 }, { x: 10, y: 5 }, 123);
    const overlay = buildOverlayModel({
      bounds: { minX: 0, minY: 0, width: 40, height: 20 },
      viewport,
      containerWidth: 400,
      containerHeight: 300,
      settings: defaultSettings,
      draftMeasurement: {
        status: 'placing-end',
        start: { x: 0, y: 0 },
        current: { x: 10, y: 5 },
        snappedTarget: null,
      },
      measurements: [committed],
      selectedMeasurementId: committed.id,
    });

    expect(overlay.majorGridLines.length).toBeGreaterThan(0);
    expect(overlay.axesLines).toHaveLength(2);
    expect(overlay.boundsRect?.width).toBe(40);
    expect(overlay.draftMeasurementLine?.x2).toBe(10);
    expect(overlay.draftMeasurementLabel?.text).toContain('Distance');
    expect(overlay.draftMeasurementLabel?.text).toContain('mm');
    expect(overlay.committedMeasurements).toHaveLength(1);
    expect(overlay.committedMeasurements[0]?.selected).toBe(true);
    expect(overlay.committedMeasurements[0]?.label.y).toBeGreaterThan(
      overlay.committedMeasurements[0]!.labelBox.y
    );
    expect(overlay.committedMeasurements[0]?.label.y).toBeLessThan(
      overlay.committedMeasurements[0]!.labelBox.y +
        overlay.committedMeasurements[0]!.labelBox.height
    );
  });

  it('round-trips svg and client coordinates through viewport math', () => {
    const viewport = actualSizeViewport({ minX: -10, minY: -5, width: 20, height: 10 }, 400, 300);
    const rect = { left: 20, top: 40 } as DOMRect;
    const svgPoint = { x: 3, y: 4 };

    const clientPoint = svgToClientPoint(svgPoint, rect, viewport);
    const roundTripped = clientToSvgPoint(clientPoint.x, clientPoint.y, rect, viewport);
    expect(roundTripped.x).toBeCloseTo(svgPoint.x, 10);
    expect(roundTripped.y).toBeCloseTo(svgPoint.y, 10);
  });

  it('computes visible document bounds from the corrected document-space viewport', () => {
    const viewport = {
      scale: 2,
      translateX: 150,
      translateY: 90,
      fitMode: 'fit' as const,
      interactionSource: 'initial' as const,
    };

    expect(getVisibleDocumentBounds(viewport, 400, 300)).toEqual({
      minX: -75,
      minY: -45,
      width: 200,
      height: 150,
    });
  });

  it('chooses a larger major step when zoomed farther out', () => {
    const near = getAdaptiveGridSpacing(8);
    const far = getAdaptiveGridSpacing(0.4);

    expect(far.majorStep).toBeGreaterThan(near.majorStep);
  });

  it('omits nonessential overlays when settings are disabled', () => {
    const overlay = buildOverlayModel({
      bounds: { minX: 0, minY: 0, width: 10, height: 10 },
      viewport: fitViewportToBounds({ minX: 0, minY: 0, width: 10, height: 10 }, 400, 300),
      containerWidth: 400,
      containerHeight: 300,
      settings: {
        ...defaultSettings,
        showGrid: false,
        showAxes: false,
        showOrigin: false,
        showBounds: false,
      },
      draftMeasurement: idleDraft,
      measurements: [],
      selectedMeasurementId: null,
    });

    expect(overlay.majorGridLines).toHaveLength(0);
    expect(overlay.axesLines).toHaveLength(0);
    expect(overlay.boundsRect).toBeNull();
    expect(overlay.origin).toBeNull();
  });

  it('extends axes through the full visible document bounds', () => {
    const overlay = buildOverlayModel({
      bounds: { minX: -50, minY: -25, width: 100, height: 50 },
      viewport: fitViewportToBounds({ minX: -50, minY: -25, width: 100, height: 50 }, 400, 300),
      containerWidth: 400,
      containerHeight: 300,
      settings: defaultSettings,
      draftMeasurement: idleDraft,
      measurements: [],
      selectedMeasurementId: null,
    });

    const xAxis = overlay.axesLines.find((line) => line.tone === 'axis-x');
    const yAxis = overlay.axesLines.find((line) => line.tone === 'axis-y');

    expect(xAxis?.x1).toBeLessThanOrEqual(-50);
    expect(xAxis?.x2).toBeGreaterThanOrEqual(50);
    expect(yAxis?.y1).toBeLessThanOrEqual(-25);
    expect(yAxis?.y2).toBeGreaterThanOrEqual(25);
  });

  it('prefers semantic snap targets when distances are close', () => {
    const viewport = fitViewportToBounds({ minX: -20, minY: -20, width: 40, height: 40 }, 400, 300);
    const rect = { left: 0, top: 0 } as DOMRect;
    const rawPoint = { x: 0.2, y: 0.2 };

    const snapped = resolveMeasurementPlacement({
      rawPoint,
      bounds: { minX: -10, minY: -10, width: 20, height: 20 },
      gridStep: 1,
      viewport,
      rect,
      includeGridSnap: true,
    });

    expect(snapped.snappedTarget?.kind).toBe('origin');
    expect(snapped.point).toEqual({ x: 0, y: 0 });
  });

  it('allows freehand placement when no snap target is within threshold', () => {
    const viewport = fitViewportToBounds({ minX: 0, minY: 0, width: 20, height: 20 }, 400, 300);
    const rect = { left: 0, top: 0 } as DOMRect;
    const rawPoint = { x: 13.37, y: 6.28 };

    const snapped = resolveMeasurementPlacement({
      rawPoint,
      bounds: { minX: 0, minY: 0, width: 20, height: 20 },
      gridStep: 5,
      viewport,
      rect,
      includeGridSnap: false,
    });

    expect(snapped.snappedTarget).toBeNull();
    expect(snapped.point).toEqual(rawPoint);
  });

  it('formats draft preview readouts and midpoint labels consistently', () => {
    const preview = getDraftMeasurementPreview({
      status: 'placing-end',
      start: { x: 2, y: 3 },
      current: { x: 8, y: 15 },
      snappedTarget: null,
    });

    expect(preview?.midpoint).toEqual({ x: 5, y: 9 });
    expect(preview?.readout).toContain('Distance');
    expect(preview?.readout).toContain('mm');
  });

  it('chooses the nearest target in screen space', () => {
    const viewport = fitViewportToBounds({ minX: 0, minY: 0, width: 20, height: 20 }, 400, 300);
    const rect = { left: 0, top: 0 } as DOMRect;
    const rawPoint = { x: 9.9, y: 10.1 };
    const targets = [
      {
        id: 'origin',
        point: { x: 0, y: 0 },
        kind: 'origin' as const,
        label: 'origin',
        priority: 1,
        screenDistance: Number.POSITIVE_INFINITY,
      },
      {
        id: 'grid',
        point: { x: 10, y: 10 },
        kind: 'grid' as const,
        label: 'grid',
        priority: 4,
        screenDistance: Number.POSITIVE_INFINITY,
      },
    ];

    const target = chooseMeasurementSnapTarget({
      point: rawPoint,
      targets,
      viewport,
      rect,
    });

    expect(target?.id).toBe('grid');
  });
});
