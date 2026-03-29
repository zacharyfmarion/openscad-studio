/** @jest-environment jsdom */

import { act, renderHook } from '@testing-library/react';
import { jest } from '@jest/globals';

const mockTrack = jest.fn();

jest.unstable_mockModule('react-konva', async () => {
  const React = await import('react');
  const Primitive = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>;
  return {
    Stage: Primitive,
    Layer: Primitive,
    Line: Primitive,
    Rect: Primitive,
    Ellipse: Primitive,
  };
});

jest.unstable_mockModule('@/analytics/runtime', () => ({
  bucketCount: (value: number) => String(value),
  createAnalyticsApi: () => ({
    track: (...args: unknown[]) => mockTrack(...args),
    trackError: jest.fn(),
    setAnalyticsEnabled: jest.fn(),
  }),
  inferErrorDomain: () => 'ui',
  setAnalyticsEnabled: jest.fn(),
  trackAnalyticsError: jest.fn(),
  trackAnalyticsEvent: jest.fn(),
  useAnalytics: () => ({
    track: (...args: unknown[]) => mockTrack(...args),
    trackError: jest.fn(),
    setAnalyticsEnabled: jest.fn(),
  }),
}));

let SVG_2D_TOOLS: typeof import('../svg-viewer/toolRegistry').SVG_2D_TOOLS;
let useSvgViewerAnalytics: typeof import('../svg-viewer/useSvgViewerAnalytics').useSvgViewerAnalytics;

describe('SvgViewer annotation wiring', () => {
  beforeAll(async () => {
    ({ SVG_2D_TOOLS } = await import('../svg-viewer/toolRegistry'));
    ({ useSvgViewerAnalytics } = await import('../svg-viewer/useSvgViewerAnalytics'));
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders a ready SVG preview and updates the coordinate HUD', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      headers: { get: () => 'image/svg+xml' },
      text: async () => filledSvg,
    });

    renderViewer();

    expect(await screen.findByTestId('preview-2d-overlay')).toBeTruthy();

    const scene = screen.getByTestId('preview-2d-scene');
    fireEvent.pointerMove(scene, { clientX: 200, clientY: 150 });

    expect((await screen.findByTestId('preview-2d-coordinate-readout')).textContent).toMatch(/x/i);
    const renderedSvg = screen
      .getByTestId('preview-2d-stage')
      .querySelector('[data-preview-svg] svg') as SVGSVGElement | null;
    expect(renderedSvg).toBeTruthy();
    expect(renderedSvg?.querySelector('rect')?.getAttribute('vector-effect')).toBe(
      'non-scaling-stroke'
    );
  });

  it('registers the annotate tool with the expected shortcut', () => {
    expect(SVG_2D_TOOLS).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'annotate',
          label: 'Annotate',
          shortcut: 'A',
        }),
      ])
    );
  });

  it('tracks annotate mode selection as a 2D viewer tool event', () => {
    const setViewMode = jest.fn();
    const resetDraftMeasurement = jest.fn();

    const { result } = renderHook(() =>
      useSvgViewerAnalytics({
        viewMode: 'pan',
        setViewMode,
        resetDraftMeasurement,
        measurementUnit: 'mm',
      })
    );

    act(() => {
      result.current.handleViewModeChange('annotate', 'toolbar');
    });

    expect(setViewMode).toHaveBeenCalledWith('annotate');
    expect(resetDraftMeasurement).toHaveBeenCalledWith('idle');
    expect(mockTrack).toHaveBeenCalledWith(
      'viewer tool selected',
      expect.objectContaining({
        viewer_kind: '2d',
        tool: 'annotate',
        input_method: 'toolbar',
      })
    );
  });
});
