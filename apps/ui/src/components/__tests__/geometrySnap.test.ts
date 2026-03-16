/** @jest-environment jsdom */

import { getClosestGeometryClientPoint } from '../svg-viewer/geometrySnap';
import { resolveMeasurementPlacement } from '../svg-viewer/measurementController';
function makeIdentityMatrix() {
  return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
}

function makeElement(args: {
  tagName: string;
  attributes: Record<string, string>;
  getTotalLength?: () => number;
  getPointAtLength?: (distance: number) => { x: number; y: number };
}) {
  return {
    tagName: args.tagName,
    getAttribute(name: string) {
      return args.attributes[name] ?? null;
    },
    getScreenCTM() {
      return makeIdentityMatrix();
    },
    getTotalLength: args.getTotalLength,
    getPointAtLength: args.getPointAtLength,
  };
}

describe('geometry snapping', () => {
  it('finds the nearest point on a rendered rect edge', () => {
    const rect = makeElement({
      tagName: 'rect',
      attributes: {
        x: '10',
        y: '20',
        width: '30',
        height: '20',
      },
    });

    expect(getClosestGeometryClientPoint(rect, { x: 25, y: 12 }, 1)).toEqual({
      x: 25,
      y: 20,
    });
  });

  it('uses geometry snapping ahead of semantic anchors when geometry is closer', () => {
    const viewport = {
      scale: 1,
      translateX: 0,
      translateY: 0,
      fitMode: 'custom' as const,
      interactionSource: 'initial' as const,
    };
    const rect = makeElement({
      tagName: 'rect',
      attributes: {
        x: '0',
        y: '0',
        width: '20',
        height: '10',
      },
    });
    const svgRoot = {
      querySelectorAll: () => [rect],
    } as unknown as SVGSVGElement;

    const resolved = resolveMeasurementPlacement({
      rawPoint: { x: 9.8, y: 0.3 },
      clientPoint: { x: 9.8, y: 0.3 },
      bounds: { minX: 0, minY: 0, width: 20, height: 10 },
      gridStep: 10,
      viewport,
      rect: { left: 0, top: 0 } as DOMRect,
      svgRoot,
      includeGridSnap: true,
    });

    expect(resolved.snappedTarget?.kind).toBe('geometry');
    expect(resolved.point.y).toBeCloseTo(0, 4);
  });

  it('does not snap to the grid when grid snapping is excluded', () => {
    const viewport = {
      scale: 1,
      translateX: 0,
      translateY: 0,
      fitMode: 'custom' as const,
      interactionSource: 'initial' as const,
    };

    const resolved = resolveMeasurementPlacement({
      rawPoint: { x: 13.37, y: 6.28 },
      clientPoint: { x: 13.37, y: 6.28 },
      bounds: { minX: 0, minY: 0, width: 200, height: 200 },
      gridStep: 5,
      viewport,
      rect: { left: 0, top: 0 } as DOMRect,
      svgRoot: null,
      includeGridSnap: false,
    });

    expect(resolved.snappedTarget).toBeNull();
    expect(resolved.point).toEqual({ x: 13.37, y: 6.28 });
  });
});
