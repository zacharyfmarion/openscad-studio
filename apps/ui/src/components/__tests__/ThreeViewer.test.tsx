/** @jest-environment jsdom */

import { act, renderHook } from '@testing-library/react';
import { jest } from '@jest/globals';

const mockTrack = jest.fn();

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

let VIEWER_TOOLS: typeof import('../three-viewer/viewerToolRegistry').VIEWER_TOOLS;
let useThreeViewerAnalytics: typeof import('../three-viewer/useThreeViewerAnalytics').useThreeViewerAnalytics;

describe('ThreeViewer annotation wiring', () => {
  beforeAll(async () => {
    ({ VIEWER_TOOLS } = await import('../three-viewer/viewerToolRegistry'));
    ({ useThreeViewerAnalytics } = await import('../three-viewer/useThreeViewerAnalytics'));
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('registers the annotate tool with the expected shortcut', () => {
    expect(VIEWER_TOOLS).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'annotate',
          label: 'Annotate',
          shortcut: 'A',
        }),
      ])
    );
  });

  it('tracks annotate mode selection as a 3D viewer tool event', () => {
    const setInteractionMode = jest.fn();
    const setDraftMeasurement = jest.fn();

    const { result } = renderHook(() =>
      useThreeViewerAnalytics({
        interactionMode: 'orbit',
        setInteractionMode,
        setDraftMeasurement,
        initialDraft: {
          status: 'idle',
          start: null,
          current: null,
          hoverPoint: null,
          hoverNormal: null,
        },
        activeBounds: null,
        loadedModel: null,
        selection: {
          objectUuid: null,
          point: null,
          normal: null,
          bounds: null,
        },
        sectionState: null,
        measurementUnit: 'mm',
        snapEnabled: true,
      })
    );

    act(() => {
      result.current.handleModeChange('annotate', 'toolbar');
    });

    expect(setInteractionMode).toHaveBeenCalledWith('annotate');
    expect(mockTrack).toHaveBeenCalledWith(
      'viewer tool selected',
      expect.objectContaining({
        viewer_kind: '3d',
        tool: 'annotate',
        input_method: 'toolbar',
      })
    );
  });
});
