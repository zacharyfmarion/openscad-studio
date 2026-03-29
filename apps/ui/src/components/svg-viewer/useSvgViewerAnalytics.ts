import { useCallback, useEffect, useRef } from 'react';
import { useAnalytics, type ViewerTool } from '../../analytics/runtime';
import type { ViewMode } from './types';

export type SvgViewerToolInputMethod = 'toolbar' | 'shortcut';

function getViewerTool(mode: ViewMode): ViewerTool {
  if (mode === 'measure-distance') {
    return 'measure_distance';
  }
  if (mode === 'annotate') {
    return 'annotate';
  }
  return 'pan';
}

interface UseSvgViewerAnalyticsOptions {
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  resetDraftMeasurement: (status?: 'idle' | 'placing-start' | 'placing-end') => void;
  measurementUnit: string;
}

export function useSvgViewerAnalytics({
  viewMode,
  setViewMode,
  resetDraftMeasurement,
  measurementUnit,
}: UseSvgViewerAnalyticsOptions) {
  const analytics = useAnalytics();
  const viewModeRef = useRef<ViewMode>('pan');

  useEffect(() => {
    viewModeRef.current = viewMode;
  }, [viewMode]);

  const handleViewModeChange = useCallback(
    (nextMode: ViewMode, inputMethod: SvgViewerToolInputMethod) => {
      const previousMode = viewModeRef.current;
      if (previousMode === nextMode) {
        return;
      }

      setViewMode(nextMode);
      resetDraftMeasurement(nextMode === 'measure-distance' ? 'placing-start' : 'idle');
      analytics.track('viewer tool selected', {
        viewer_kind: '2d',
        tool: getViewerTool(nextMode),
        input_method: inputMethod,
        measurement_unit: measurementUnit,
      });
    },
    [analytics, measurementUnit, resetDraftMeasurement, setViewMode]
  );

  const toggleMeasurementMode = useCallback(
    (inputMethod: SvgViewerToolInputMethod) => {
      const nextMode = viewModeRef.current === 'measure-distance' ? 'pan' : 'measure-distance';
      handleViewModeChange(nextMode, inputMethod);
    },
    [handleViewModeChange]
  );

  const trackMeasurementCommitted = useCallback(
    (measurementCount: number) => {
      analytics.track('measurement committed', {
        viewer_kind: '2d',
        measurement_kind: 'distance',
        measurement_count: measurementCount,
        measurement_unit: measurementUnit,
      });
    },
    [analytics, measurementUnit]
  );

  const trackMeasurementsCleared = useCallback(
    (clearedCount: number) => {
      if (clearedCount > 0) {
        analytics.track('measurements cleared', {
          viewer_kind: '2d',
          cleared_count: clearedCount,
        });
      }
    },
    [analytics]
  );

  return {
    handleViewModeChange,
    toggleMeasurementMode,
    trackMeasurementCommitted,
    trackMeasurementsCleared,
  };
}
