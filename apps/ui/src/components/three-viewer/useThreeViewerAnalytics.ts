import { useCallback, useEffect, useRef, type Dispatch, type SetStateAction } from 'react';
import { useAnalytics, type ViewerTool } from '../../analytics/runtime';
import type {
  InteractionMode,
  LoadedPreviewModel,
  MeasurementDraft3D,
  SectionPlaneState,
  SelectionState,
} from './types';

export type ViewerToolInputMethod = 'toolbar' | 'shortcut';

function getViewerTool(mode: InteractionMode): ViewerTool {
  switch (mode) {
    case 'measure-distance':
      return 'measure_distance';
    case 'measure-bbox':
      return 'measure_bbox';
    case 'section-plane':
      return 'section_plane';
    case 'annotate':
      return 'annotate';
    case 'orbit':
    default:
      return 'orbit';
  }
}

interface UseThreeViewerAnalyticsOptions {
  interactionMode: InteractionMode;
  setInteractionMode: (mode: InteractionMode) => void;
  setDraftMeasurement: Dispatch<SetStateAction<MeasurementDraft3D>>;
  initialDraft: MeasurementDraft3D;
  activeBounds: SelectionState['bounds'] | LoadedPreviewModel['bounds'] | null;
  loadedModel: LoadedPreviewModel | null;
  selection: SelectionState;
  sectionState: SectionPlaneState | null;
  measurementUnit: string;
  snapEnabled: boolean;
}

export function useThreeViewerAnalytics({
  interactionMode,
  setInteractionMode,
  setDraftMeasurement,
  initialDraft,
  activeBounds,
  loadedModel,
  selection,
  sectionState,
  measurementUnit,
  snapEnabled,
}: UseThreeViewerAnalyticsOptions) {
  const analytics = useAnalytics();
  const interactionModeRef = useRef<InteractionMode>('orbit');
  const previousSectionEnabledRef = useRef<boolean | null>(null);
  const lastBBoxMeasurementKeyRef = useRef<string | null>(null);

  useEffect(() => {
    interactionModeRef.current = interactionMode;
  }, [interactionMode]);

  useEffect(() => {
    if (!sectionState) {
      previousSectionEnabledRef.current = null;
      return;
    }

    if (previousSectionEnabledRef.current === null) {
      previousSectionEnabledRef.current = sectionState.enabled;
      return;
    }

    if (previousSectionEnabledRef.current !== sectionState.enabled) {
      analytics.track('section plane toggled', {
        enabled: sectionState.enabled,
        axis: sectionState.axis,
        measurement_unit: measurementUnit,
      });
      previousSectionEnabledRef.current = sectionState.enabled;
    }
  }, [analytics, measurementUnit, sectionState]);

  useEffect(() => {
    if (interactionMode !== 'measure-bbox' || !activeBounds) {
      lastBBoxMeasurementKeyRef.current = null;
      return;
    }

    const bboxScope = selection.bounds ? 'selection' : 'full_model';
    const bboxKey = `${loadedModel?.version ?? 'none'}:${selection.objectUuid ?? 'full-model'}:${bboxScope}`;

    if (lastBBoxMeasurementKeyRef.current === bboxKey) {
      return;
    }

    lastBBoxMeasurementKeyRef.current = bboxKey;
    analytics.track('measurement committed', {
      viewer_kind: '3d',
      measurement_kind: 'bbox',
      measurement_unit: measurementUnit,
      bbox_scope: bboxScope,
    });
  }, [
    activeBounds,
    analytics,
    interactionMode,
    loadedModel?.version,
    measurementUnit,
    selection.bounds,
    selection.objectUuid,
  ]);

  const handleModeChange = useCallback(
    (next: InteractionMode, inputMethod: ViewerToolInputMethod) => {
      const previousMode = interactionModeRef.current;
      const resolvedMode = previousMode === next ? 'orbit' : next;

      if (resolvedMode === previousMode) {
        setDraftMeasurement(initialDraft);
        return;
      }

      setInteractionMode(resolvedMode);
      if (resolvedMode === 'measure-distance') {
        setDraftMeasurement({ ...initialDraft, status: 'placing-start' });
      } else {
        setDraftMeasurement(initialDraft);
      }

      analytics.track('viewer tool selected', {
        viewer_kind: '3d',
        tool: getViewerTool(resolvedMode),
        input_method: inputMethod,
        measurement_unit: measurementUnit,
      });
    },
    [analytics, initialDraft, measurementUnit, setDraftMeasurement, setInteractionMode]
  );

  const trackMeasurementsCleared = useCallback(
    (clearedCount: number) => {
      if (clearedCount > 0) {
        analytics.track('measurements cleared', {
          viewer_kind: '3d',
          cleared_count: clearedCount,
        });
      }
    },
    [analytics]
  );

  const trackDistanceMeasurementCommitted = useCallback(
    (measurementCount: number) => {
      analytics.track('measurement committed', {
        viewer_kind: '3d',
        measurement_kind: 'distance',
        measurement_count: measurementCount,
        measurement_unit: measurementUnit,
        snap_enabled: snapEnabled,
      });
    },
    [analytics, measurementUnit, snapEnabled]
  );

  return {
    handleModeChange,
    trackMeasurementsCleared,
    trackDistanceMeasurementCommitted,
  };
}
