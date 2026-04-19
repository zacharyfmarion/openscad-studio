import { useEffect, useMemo, useRef, useState } from 'react';
import { TbBrush, TbFocus2, TbGrid3X3, TbX, TbZoomIn, TbZoomOut } from 'react-icons/tb';
import { useTheme } from '../contexts/ThemeContext';
import { getPreviewSceneStyle } from '../services/previewSceneConfig';
import { Button, IconButton, Text } from './ui';
import { ToolPanel } from './three-viewer/panels/ToolPanel';
import type { MeasurementListItemData } from './viewer-measurements/types';
import { updateSetting, useSettings } from '../stores/settingsStore';
import { useMobileLayout } from '../hooks/useMobileLayout';
import { buildOverlayModel } from './svg-viewer/overlayModel';
import { attachBrowserPinchZoomGuard } from './svg-viewer/browserPinchZoomGuard';
import { SVG_2D_TOOLS } from './svg-viewer/toolRegistry';
import { useSvgViewerAnalytics } from './svg-viewer/useSvgViewerAnalytics';
import { useAnalytics } from '../analytics/runtime';
import {
  createCommittedMeasurement,
  formatMeasurementReadout,
  getDraftMeasurementPreview,
  getMeasurementMidpoint,
  isDraftMeasurementActive,
  resolveMeasurementPlacement,
} from './svg-viewer/measurementController';
import { parseSvgMetrics } from './svg-viewer/parseSvgMetrics';
import {
  actualSizeViewport,
  clampScale,
  clientToSvgPoint,
  fitViewportToBounds,
  sanitizeViewport,
  zoomAroundClientPoint,
} from './svg-viewer/viewportMath';
import type {
  CommittedMeasurement,
  MeasurementDraft,
  ParsedSvgDocument,
  SvgPoint,
  SvgViewportState,
  ViewMode,
  ViewerOverlaySettings,
} from './svg-viewer/types';
import {
  AnnotationOverlay,
  AnnotationPanel,
  composeAnnotatedImage,
  createAnnotationAttachmentFile,
  exportAnnotationOverlayDataUrl,
  normalizeViewerPoint,
  useViewerAnnotationSession,
  type ViewerAnnotationAttachResult,
} from './viewer-annotation';
import { captureRenderedSvgElementImage } from '../utils/captureSvgPreviewImage';
import { notifyError, notifySuccess } from '../utils/notifications';
import type Konva from 'konva';

interface SvgViewerProps {
  src: string;
  viewerId?: string;
  onVisualReady?: () => void;
  hasCurrentModelApiKey: boolean;
  canAttachToAi: boolean;
  onAttachToAi: (file: File) => Promise<ViewerAnnotationAttachResult>;
}

type DocumentStatus = 'idle' | 'loading' | 'ready' | 'empty' | 'error';
interface DocumentState {
  status: DocumentStatus;
  error: string;
  helperText: string;
  warnings: string[];
}

const INITIAL_VIEWPORT: SvgViewportState = {
  scale: 1,
  translateX: 0,
  translateY: 0,
  fitMode: 'fit',
  interactionSource: 'initial',
};

const INITIAL_DOCUMENT_STATE: DocumentState = {
  status: 'idle',
  error: '',
  helperText: '',
  warnings: [],
};

const INITIAL_DRAFT_MEASUREMENT: MeasurementDraft = {
  status: 'idle',
  start: null,
  current: null,
  snappedTarget: null,
};

function formatCoordinate(point: SvgPoint | null) {
  if (!point) {
    return '';
  }

  const formatValue = (value: number) =>
    (Math.abs(value) >= 100 ? value.toFixed(1) : value.toFixed(2))
      .replace(/\.00$/, '')
      .replace(/(\.\d)0$/, '$1');

  return `x ${formatValue(point.x)}  y ${formatValue(point.y)}`;
}

function Svg2DToolPalette({
  mode,
  onModeChange,
  canInteract,
}: {
  mode: ViewMode;
  onModeChange: (mode: ViewMode) => void;
  canInteract: boolean;
}) {
  return (
    <div
      className="flex flex-col shrink-0 items-center"
      style={{
        width: '44px',
        padding: '6px 0',
        gap: '2px',
        borderRight: '1px solid var(--border-primary)',
      }}
      data-testid="preview-2d-tool-palette"
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
    >
      {SVG_2D_TOOLS.map((tool) => {
        const isActive = mode === tool.id;
        const isDisabled = !canInteract;
        const Icon = tool.icon;
        return (
          // eslint-disable-next-line no-restricted-syntax -- palette tool buttons carry a full set of imperative inline styles driven by active+disabled state; matches ViewerToolPalette pattern in ThreeViewer
          <button
            key={tool.id}
            type="button"
            title={`${tool.label} (${tool.shortcut})`}
            aria-label={`${tool.label} (${tool.shortcut})`}
            disabled={isDisabled}
            onClick={() => onModeChange(tool.id)}
            data-testid={`preview-2d-tool-${
              tool.id === 'pan' ? 'pan' : tool.id === 'measure-distance' ? 'measure' : 'annotate'
            }`}
            style={{
              width: '32px',
              height: '32px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: isActive ? 'var(--bg-tertiary, var(--bg-elevated))' : 'transparent',
              color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
              opacity: isDisabled ? 0.35 : 1,
              border: isActive ? '1px solid var(--border-primary)' : '1px solid transparent',
              borderRadius: 'var(--radius-md)',
              cursor: isDisabled ? 'not-allowed' : 'pointer',
              transition: 'background-color 0.15s, color 0.15s, border-color 0.15s',
              flexShrink: 0,
            }}
          >
            <Icon size={17} />
          </button>
        );
      })}
    </div>
  );
}

function Svg2DMeasurePanel({
  draftMeasurement,
  measureSummary,
  measurementItems,
  onMeasurementSelect,
  onMeasurementDelete,
  onMeasurementsClear,
}: {
  draftMeasurement: MeasurementDraft;
  measureSummary: string | null;
  measurementItems: MeasurementListItemData[];
  onMeasurementSelect: (id: string) => void;
  onMeasurementDelete: (id: string) => void;
  onMeasurementsClear: () => void;
}) {
  const helpText =
    draftMeasurement.status === 'placing-end'
      ? 'Click to finish. Hold Shift to lock angle. Esc cancels.'
      : 'Click to place start. Hold Shift to lock angle. Esc exits.';

  return (
    <div className="flex min-h-0 flex-col gap-3" data-testid="preview-2d-context-bar">
      <span
        className="text-xs"
        style={{ color: 'var(--text-secondary)' }}
        data-testid="preview-2d-measure-help"
      >
        {helpText}
      </span>

      {measureSummary ? (
        <span
          className="text-xs font-medium"
          style={{ color: 'var(--text-secondary)' }}
          data-testid="preview-2d-measurement-readout"
        >
          {measureSummary}
        </span>
      ) : null}

      {measurementItems.length > 0 ? (
        <>
          <div
            className="min-h-0 overflow-y-auto pr-1 space-y-1.5"
            style={{ maxHeight: '160px' }}
            data-testid="preview-2d-measurements-tray"
          >
            {measurementItems.map((item) => {
              const selected = item.selected;
              return (
                <div
                  key={item.id}
                  className="flex shrink-0 items-center rounded-lg overflow-hidden text-xs"
                  style={{
                    backgroundColor: selected ? 'var(--bg-tertiary)' : 'var(--bg-elevated)',
                    border: `1px solid ${selected ? 'var(--accent-primary)' : 'var(--border-primary)'}`,
                  }}
                >
                  {/* eslint-disable-next-line no-restricted-syntax -- left half of a split chip; matches MeasurePanel chip pattern */}
                  <button
                    type="button"
                    data-testid="preview-2d-measurement-list-item"
                    aria-pressed={selected}
                    onClick={() => onMeasurementSelect(item.id)}
                    className="flex-1 px-2 py-1.5 text-left"
                    style={{
                      color: selected ? 'var(--text-primary)' : 'var(--text-secondary)',
                    }}
                  >
                    {item.summary}
                  </button>
                  {/* eslint-disable-next-line no-restricted-syntax -- right half of the chip delete action; matches MeasurePanel chip pattern */}
                  <button
                    type="button"
                    aria-label="Delete measurement"
                    data-testid="preview-2d-delete-measurement"
                    onClick={(e) => {
                      e.stopPropagation();
                      onMeasurementDelete(item.id);
                    }}
                    className="flex items-center justify-center px-2 py-1.5 transition-colors"
                    style={{
                      borderLeft: `1px solid ${selected ? 'var(--accent-primary)' : 'var(--border-primary)'}`,
                      color: 'var(--text-secondary)',
                      backgroundColor: 'transparent',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor =
                        'color-mix(in srgb, var(--bg-primary) 60%, transparent)';
                      e.currentTarget.style.color = 'var(--text-primary)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'transparent';
                      e.currentTarget.style.color = 'var(--text-secondary)';
                    }}
                  >
                    <TbX size={12} />
                  </button>
                </div>
              );
            })}
          </div>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            data-testid="preview-2d-clear-measurements"
            onClick={onMeasurementsClear}
            className="shrink-0"
          >
            Clear all
          </Button>
        </>
      ) : null}
    </div>
  );
}

function ToolbarTextButton({
  label,
  onClick,
  active = false,
  disabled = false,
  title,
  testId,
}: {
  label: string;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  title: string;
  testId?: string;
}) {
  return (
    // eslint-disable-next-line no-restricted-syntax -- text toolbar buttons match the icon button visual style (bg-elevated, rounded-lg, same border/height) without a fixed width; Button variants don't expose this exact combination
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={title}
      title={title}
      data-testid={testId}
      className="h-8 rounded-lg transition-colors flex items-center justify-center px-2 text-sm font-medium"
      style={{
        backgroundColor: active ? 'var(--bg-tertiary)' : 'var(--bg-elevated)',
        border: '1px solid var(--border-secondary)',
        color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
        opacity: disabled ? 0.4 : 1,
        cursor: disabled ? 'not-allowed' : 'pointer',
      }}
    >
      {label}
    </button>
  );
}

function StatusCard({
  title,
  detail,
  helperText,
}: {
  title: string;
  detail: string;
  helperText?: string;
}) {
  return (
    <div className="h-full w-full flex items-center justify-center px-6">
      <div
        className="text-center max-w-md px-5 py-4 rounded-lg"
        style={{
          color: 'var(--text-secondary)',
          backgroundColor: 'var(--bg-elevated)',
          border: '1px solid var(--border-primary)',
        }}
      >
        <Text variant="panel-title" weight="medium" as="p" className="mb-2">
          {title}
        </Text>
        <Text variant="body" className="whitespace-pre-wrap">
          {detail}
        </Text>
        {helperText ? (
          <Text variant="caption" color="tertiary" className="mt-3">
            {helperText}
          </Text>
        ) : null}
      </div>
    </div>
  );
}

export function SvgViewer({
  src,
  viewerId,
  onVisualReady,
  hasCurrentModelApiKey,
  canAttachToAi,
  onAttachToAi,
}: SvgViewerProps) {
  const { theme } = useTheme();
  const [settings] = useSettings();
  const { isMobile } = useMobileLayout();
  const [documentState, setDocumentState] = useState<DocumentState>(INITIAL_DOCUMENT_STATE);
  const [loadedDocument, setLoadedDocument] = useState<ParsedSvgDocument | null>(null);
  const [viewport, setViewport] = useState<SvgViewportState>(INITIAL_VIEWPORT);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const [viewMode, setViewMode] = useState<ViewMode>('pan');
  const [draftMeasurement, setDraftMeasurement] =
    useState<MeasurementDraft>(INITIAL_DRAFT_MEASUREMENT);
  const [measurements, setMeasurements] = useState<CommittedMeasurement[]>([]);
  const [selectedMeasurementId, setSelectedMeasurementId] = useState<string | null>(null);
  const [liveMessage, setLiveMessage] = useState('');
  const [cursorPoint, setCursorPoint] = useState<SvgPoint | null>(null);
  const [isAttachingAnnotation, setIsAttachingAnnotation] = useState(false);
  const lastVisualReadySrcRef = useRef<string | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const annotationStageRef = useRef<Konva.Stage | null>(null);
  const lastPointerClientRef = useRef<SvgPoint | null>(null);
  const suppressClickRef = useRef(false);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originTranslateX: number;
    originTranslateY: number;
    moved: boolean;
  } | null>(null);
  const activePointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const lastPinchDistRef = useRef<number | null>(null);
  const sceneStyle = useMemo(() => getPreviewSceneStyle(theme), [theme]);
  const annotationSession = useViewerAnnotationSession();
  const resetAnnotationSession = annotationSession.resetSession;
  const analytics = useAnalytics();

  const themeColors = useMemo(
    () => ({
      background: theme.colors.bg.primary,
      minorGrid: sceneStyle.axis.tickColor,
      majorGrid: theme.colors.border.secondary,
      xAxis: sceneStyle.axis.xColor,
      yAxis: sceneStyle.axis.yColor,
      bounds: theme.colors.semantic.info,
      measure: theme.colors.accent.primary,
      measureSelected: theme.colors.accent.hover,
      labelBackground: theme.colors.bg.elevated,
      labelText: theme.colors.text.primary,
      bannerBackground: theme.colors.bg.elevated,
    }),
    [sceneStyle.axis.tickColor, sceneStyle.axis.xColor, sceneStyle.axis.yColor, theme]
  );

  const overlaySettings = useMemo<ViewerOverlaySettings>(
    () => ({
      showAxes: settings.viewer.show2DAxes,
      showGrid: settings.viewer.show2DGrid,
      showOrigin: settings.viewer.show2DOrigin,
      showBounds: settings.viewer.show2DBounds,
      showCursorCoords: settings.viewer.show2DCursorCoords,
      enableGridSnap: settings.viewer.enable2DGridSnap,
    }),
    [settings.viewer]
  );

  const overlayModel = useMemo(() => {
    if (!loadedDocument || containerSize.width <= 0 || containerSize.height <= 0) {
      return null;
    }

    return buildOverlayModel({
      bounds: loadedDocument.metrics.contentBounds,
      viewport,
      containerWidth: containerSize.width,
      containerHeight: containerSize.height,
      settings: overlaySettings,
      draftMeasurement,
      measurements,
      selectedMeasurementId,
    });
  }, [
    containerSize.height,
    containerSize.width,
    draftMeasurement,
    loadedDocument,
    measurements,
    overlaySettings,
    selectedMeasurementId,
    viewport,
  ]);

  const resetDraftMeasurement = (status: MeasurementDraft['status'] = 'idle') => {
    setDraftMeasurement({
      status,
      start: null,
      current: null,
      snappedTarget: null,
    });
  };

  const {
    handleViewModeChange,
    toggleMeasurementMode,
    trackMeasurementCommitted,
    trackMeasurementsCleared,
  } = useSvgViewerAnalytics({
    viewMode,
    setViewMode,
    resetDraftMeasurement,
    measurementUnit: settings.viewer.measurementUnit,
  });

  useEffect(() => {
    if (!src) {
      setDocumentState(INITIAL_DOCUMENT_STATE);
      setLoadedDocument(null);
      setViewport(INITIAL_VIEWPORT);
      setViewMode('pan');
      resetDraftMeasurement();
      setMeasurements([]);
      setSelectedMeasurementId(null);
      setCursorPoint(null);
      resetAnnotationSession();
      setIsAttachingAnnotation(false);
      lastPointerClientRef.current = null;
      return;
    }

    let cancelled = false;
    setViewport(INITIAL_VIEWPORT);
    setDocumentState((previous) => ({
      ...previous,
      status: 'loading',
      error: '',
      helperText: '',
      warnings: previous.warnings,
    }));
    setCursorPoint(null);
    resetDraftMeasurement();
    setMeasurements([]);
    setSelectedMeasurementId(null);
    resetAnnotationSession();
    setIsAttachingAnnotation(false);
    suppressClickRef.current = false;
    lastPointerClientRef.current = null;

    const loadSvg = async () => {
      try {
        const response = await fetch(src);
        const contentType = response.headers.get('content-type');
        if (!response.ok) {
          throw new Error(`Failed to fetch SVG preview: ${response.statusText}`);
        }
        if (contentType && !contentType.includes('svg') && !contentType.includes('xml')) {
          throw new Error('Preview response was not an SVG document.');
        }

        const text = await response.text();
        const parsed = parseSvgMetrics(text, {
          defaultFillColor: sceneStyle.svgModelColor,
        });
        if (cancelled) {
          return;
        }

        setLoadedDocument(parsed);
        setDocumentState({
          status: parsed.metrics.isEmpty ? 'empty' : 'ready',
          error: '',
          helperText: parsed.metrics.isEmpty
            ? 'The render completed but produced no visible 2D geometry. If this model depends on a custom font, try a bundled web family like Liberation Sans, Liberation Serif, Liberation Mono, sans-serif, serif, or monospace.'
            : '',
          warnings: parsed.metrics.warnings,
        });
      } catch (err) {
        if (cancelled) {
          return;
        }

        const message = err instanceof Error ? err.message : String(err);
        setDocumentState({
          status: 'error',
          error: message,
          helperText: 'The last successful 2D preview is still shown if one is available.',
          warnings: [],
        });
      }
    };

    void loadSvg();

    return () => {
      cancelled = true;
    };
  }, [resetAnnotationSession, sceneStyle.svgModelColor, src]);

  useEffect(() => {
    if (!src || !loadedDocument || documentState.status === 'loading') {
      return;
    }

    if (lastVisualReadySrcRef.current === src) {
      return;
    }

    lastVisualReadySrcRef.current = src;
    onVisualReady?.();
  }, [documentState.status, loadedDocument, onVisualReady, src]);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) {
      return;
    }

    const updateSize = () => {
      const rect = element.getBoundingClientRect();
      setContainerSize({
        width: rect.width,
        height: rect.height,
      });
    };

    updateSize();

    const observer = new ResizeObserver(() => {
      updateSize();
    });
    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) {
      return;
    }

    return attachBrowserPinchZoomGuard(element);
  }, []);

  useEffect(() => {
    if (!loadedDocument || containerSize.width <= 0 || containerSize.height <= 0) {
      return;
    }

    setViewport((current) => {
      if (current.fitMode === 'custom' && current.interactionSource !== 'initial') {
        return current;
      }

      return fitViewportToBounds(
        loadedDocument.metrics.contentBounds,
        containerSize.width,
        containerSize.height,
        current.interactionSource === 'initial' ? 'initial' : 'resize'
      );
    });
  }, [containerSize.height, containerSize.width, loadedDocument]);

  useEffect(() => {
    if (!loadedDocument) {
      return;
    }

    resetDraftMeasurement();
    setMeasurements([]);
    setSelectedMeasurementId(null);
    setCursorPoint(null);
  }, [loadedDocument]);

  useEffect(() => {
    resetDraftMeasurement(viewMode === 'measure-distance' ? 'placing-start' : 'idle');
    setCursorPoint(null);
  }, [viewMode]);

  const exitAnnotationMode = () => {
    resetAnnotationSession();
    setViewMode('pan');
  };

  const handleAnnotationCommit = () => {
    const shape = annotationSession.completeDraft();
    if (shape) {
      analytics.track('annotation committed', { viewer_kind: '2d', shape_type: shape.kind });
    }
  };

  const handleAnnotationClear = () => {
    const count = annotationSession.shapes.length + (annotationSession.draft ? 1 : 0);
    annotationSession.clearAll();
    if (count > 0) {
      analytics.track('annotations cleared', { viewer_kind: '2d', cleared_count: count });
    }
  };

  const handleAnnotationAttach = async () => {
    if (!containerRef.current || !annotationStageRef.current) {
      notifyError({
        operation: 'viewer-annotation-export',
        fallbackMessage: 'No preview is available to annotate.',
        toastId: 'viewer-annotation-export-error',
      });
      return;
    }

    const sceneSvg = containerRef.current.querySelector(
      '[data-testid="preview-2d-scene"]'
    ) as SVGSVGElement | null;

    if (!sceneSvg || containerSize.width <= 0 || containerSize.height <= 0) {
      notifyError({
        operation: 'viewer-annotation-export',
        fallbackMessage: 'No preview is available to annotate.',
        toastId: 'viewer-annotation-export-error',
      });
      return;
    }

    setIsAttachingAnnotation(true);
    try {
      const baseImageDataUrl = await captureRenderedSvgElementImage({
        svgElement: sceneSvg,
        targetWidth: containerSize.width,
        targetHeight: containerSize.height,
        backgroundColor: themeColors.background,
      });

      if (!baseImageDataUrl) {
        throw new Error('The current 2D preview could not be captured.');
      }

      const overlay = await exportAnnotationOverlayDataUrl({
        stage: annotationStageRef.current,
        surface: containerSize,
        pixelRatio: typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1,
      });

      const composedDataUrl = await composeAnnotatedImage({
        baseImageDataUrl,
        overlayImageDataUrl: overlay.dataUrl,
        width: overlay.width,
        height: overlay.height,
        backgroundColor: themeColors.background,
      });
      const attachmentFile = await createAnnotationAttachmentFile(
        composedDataUrl,
        'viewer-annotation-2d.png'
      );

      const shapeCount = annotationSession.shapes.length;
      const result = await onAttachToAi(attachmentFile);
      if (result.status === 'attached') {
        analytics.track('annotation attached', {
          viewer_kind: '2d',
          shape_count: shapeCount,
          result: 'attached',
        });
        notifySuccess('Annotation attached to AI', {
          toastId: 'viewer-annotation-attached',
        });
        exitAnnotationMode();
        return;
      }

      if (result.status === 'missing-api-key') {
        analytics.track('annotation attached', {
          viewer_kind: '2d',
          shape_count: shapeCount,
          result: 'missing-api-key',
        });
        notifyError({
          operation: 'viewer-annotation-attach',
          fallbackMessage: 'Add an AI API key in Settings to attach annotations to the chat panel.',
          toastId: 'viewer-annotation-missing-key',
        });
        return;
      }

      if (result.status === 'busy') {
        analytics.track('annotation attached', {
          viewer_kind: '2d',
          shape_count: shapeCount,
          result: 'busy',
        });
        notifyError({
          operation: 'viewer-annotation-attach',
          fallbackMessage: 'Wait for the current AI request or attachment processing to finish.',
          toastId: 'viewer-annotation-ai-busy',
        });
        return;
      }

      analytics.track('annotation attached', {
        viewer_kind: '2d',
        shape_count: shapeCount,
        result: 'error',
      });
      notifyError({
        operation: 'viewer-annotation-attach',
        fallbackMessage: result.errors[0] ?? 'Failed to attach the annotation image.',
        toastId: 'viewer-annotation-attach-error',
      });
    } catch (error) {
      notifyError({
        operation: 'viewer-annotation-export',
        error,
        fallbackMessage: 'Failed to export the annotated preview.',
        toastId: 'viewer-annotation-export-error',
      });
    } finally {
      setIsAttachingAnnotation(false);
    }
  };

  const fitToDrawing = () => {
    if (!loadedDocument || containerSize.width <= 0 || containerSize.height <= 0) {
      return;
    }

    setViewport(
      fitViewportToBounds(
        loadedDocument.metrics.contentBounds,
        containerSize.width,
        containerSize.height,
        'toolbar'
      )
    );
  };

  const setActualScale = () => {
    if (!loadedDocument || containerSize.width <= 0 || containerSize.height <= 0) {
      return;
    }

    setViewport(
      actualSizeViewport(
        loadedDocument.metrics.contentBounds,
        containerSize.width,
        containerSize.height,
        'toolbar'
      )
    );
  };

  const adjustZoom = (factor: number) => {
    if (!containerRef.current) {
      return;
    }

    const rect = containerRef.current.getBoundingClientRect();
    const nextScale = clampScale(viewport.scale * factor);
    setViewport(
      zoomAroundClientPoint(
        viewport,
        nextScale,
        rect.left + rect.width / 2,
        rect.top + rect.height / 2,
        rect
      )
    );
  };

  const handleGridToggle = () => {
    updateSetting('viewer', { show2DGrid: !settings.viewer.show2DGrid });
  };

  const updateCursorAndDraftFromEvent = (clientX: number, clientY: number, shiftKey = false) => {
    if (!containerRef.current || !loadedDocument) {
      return;
    }

    if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) {
      return;
    }

    const rect = containerRef.current.getBoundingClientRect();
    const renderedSvgRoot = containerRef.current.querySelector(
      '[data-preview-svg] svg'
    ) as SVGSVGElement | null;
    const rawPoint = clientToSvgPoint(clientX, clientY, rect, viewport);
    lastPointerClientRef.current = { x: clientX, y: clientY };
    setCursorPoint(rawPoint);

    if (viewMode !== 'measure-distance' || !overlayModel) {
      return;
    }

    const resolved = resolveMeasurementPlacement({
      rawPoint,
      clientPoint: { x: clientX, y: clientY },
      bounds: loadedDocument.metrics.contentBounds,
      gridStep: overlayModel.gridStep,
      viewport,
      rect,
      svgRoot: renderedSvgRoot,
      includeGridSnap: settings.viewer.enable2DGridSnap && settings.viewer.show2DGrid,
      draftStart: draftMeasurement.start,
      lockAngle: shiftKey && draftMeasurement.status === 'placing-end',
    });

    setDraftMeasurement((current) => ({
      ...current,
      current: resolved.point,
      snappedTarget: resolved.snappedTarget,
      status: current.status === 'idle' ? 'placing-start' : current.status,
    }));
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    containerRef.current?.focus();

    if (viewMode === 'annotate') {
      return;
    }

    activePointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    event.currentTarget.setPointerCapture(event.pointerId);

    if (documentState.status === 'loading' || !loadedDocument) {
      return;
    }

    if (activePointersRef.current.size >= 2) {
      // Second finger down — cancel any pan drag and initialize pinch tracking
      dragRef.current = null;
      const pts = [...activePointersRef.current.values()];
      lastPinchDistRef.current = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
      return;
    }

    if (viewMode === 'measure-distance') {
      return;
    }

    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originTranslateX: viewport.translateX,
      originTranslateY: viewport.translateY,
      moved: false,
    };
    suppressClickRef.current = false;
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (viewMode === 'annotate') {
      return;
    }

    activePointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });

    // Pinch-to-zoom: two active pointers
    if (activePointersRef.current.size >= 2 && lastPinchDistRef.current !== null) {
      const pts = [...activePointersRef.current.values()];
      const newDist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
      const scaleFactor = newDist / lastPinchDistRef.current;
      lastPinchDistRef.current = newDist;
      const midX = (pts[0].x + pts[1].x) / 2;
      const midY = (pts[0].y + pts[1].y) / 2;
      const rect = containerRef.current?.getBoundingClientRect();
      if (rect) {
        setViewport((prev) =>
          zoomAroundClientPoint(prev, clampScale(prev.scale * scaleFactor), midX, midY, rect)
        );
      }
      return;
    }

    updateCursorAndDraftFromEvent(event.clientX, event.clientY, event.shiftKey);

    if (!dragRef.current) {
      return;
    }

    const deltaX = event.clientX - dragRef.current.startX;
    const deltaY = event.clientY - dragRef.current.startY;
    if (Math.abs(deltaX) > 2 || Math.abs(deltaY) > 2) {
      dragRef.current.moved = true;
    }

    // Capture before setViewport — Safari can fire pointercancel between the null
    // guard above and when the React updater callback runs, setting dragRef.current
    // to null and causing a crash.
    const { originTranslateX, originTranslateY } = dragRef.current;

    setViewport((current) =>
      sanitizeViewport({
        ...current,
        translateX: originTranslateX + deltaX,
        translateY: originTranslateY + deltaY,
        fitMode: 'custom',
        interactionSource: 'pan',
      })
    );
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    activePointersRef.current.delete(event.pointerId);
    if (activePointersRef.current.size < 2) {
      lastPinchDistRef.current = null;
    }

    if (dragRef.current?.pointerId === event.pointerId) {
      suppressClickRef.current = dragRef.current.moved;
      dragRef.current = null;
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const handlePointerLeave = () => {
    setCursorPoint(null);
    lastPointerClientRef.current = null;
    if (viewMode === 'measure-distance') {
      setDraftMeasurement((current) => ({
        ...current,
        current: current.status === 'placing-end' ? current.current : null,
        snappedTarget: null,
      }));
    }
  };

  const handleWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    if (!loadedDocument || documentState.status === 'loading' || viewMode === 'annotate') {
      return;
    }

    event.preventDefault();
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) {
      return;
    }

    const factor = Math.exp(-event.deltaY * 0.0015);
    setViewport(
      zoomAroundClientPoint(viewport, viewport.scale * factor, event.clientX, event.clientY, rect)
    );
  };

  const handleClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }

    if (!Number.isFinite(event.clientX) || !Number.isFinite(event.clientY)) {
      return;
    }

    if (
      !loadedDocument ||
      !overlayModel ||
      viewMode !== 'measure-distance' ||
      documentState.status === 'loading' ||
      documentState.status === 'error'
    ) {
      return;
    }

    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) {
      return;
    }
    const renderedSvgRoot = containerRef.current?.querySelector(
      '[data-preview-svg] svg'
    ) as SVGSVGElement | null;
    lastPointerClientRef.current = { x: event.clientX, y: event.clientY };

    const rawPoint = clientToSvgPoint(event.clientX, event.clientY, rect, viewport);
    const resolved = resolveMeasurementPlacement({
      rawPoint,
      clientPoint: { x: event.clientX, y: event.clientY },
      bounds: loadedDocument.metrics.contentBounds,
      gridStep: overlayModel.gridStep,
      viewport,
      rect,
      svgRoot: renderedSvgRoot,
      includeGridSnap: settings.viewer.enable2DGridSnap && settings.viewer.show2DGrid,
      draftStart: draftMeasurement.start,
      lockAngle: event.shiftKey && draftMeasurement.status === 'placing-end',
    });

    setDraftMeasurement((current) => {
      if (current.status !== 'placing-end' || !current.start) {
        return {
          status: 'placing-end',
          start: resolved.point,
          current: resolved.point,
          snappedTarget: resolved.snappedTarget,
        };
      }

      const measurement = createCommittedMeasurement(current.start, resolved.point);
      setMeasurements((existing) => [measurement, ...existing]);
      setSelectedMeasurementId(measurement.id);
      setLiveMessage('Measurement added');
      trackMeasurementCommitted(measurements.length + 1);

      return {
        status: 'placing-start',
        start: null,
        current: null,
        snappedTarget: resolved.snappedTarget,
      };
    });
  };

  const removeSelectedMeasurement = () => {
    if (!selectedMeasurementId) {
      return;
    }

    setMeasurements((existing) =>
      existing.filter((measurement) => measurement.id !== selectedMeasurementId)
    );
    setSelectedMeasurementId(null);
    setLiveMessage('Measurement deleted');
  };

  const clearAllMeasurements = () => {
    trackMeasurementsCleared(measurements.length);
    setMeasurements([]);
    setSelectedMeasurementId(null);
    setLiveMessage('Measurements cleared');
  };

  const selectMeasurement = (measurementId: string) => {
    setSelectedMeasurementId(measurementId);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    switch (event.key) {
      case 'Shift':
        if (
          viewMode === 'measure-distance' &&
          draftMeasurement.status === 'placing-end' &&
          lastPointerClientRef.current
        ) {
          updateCursorAndDraftFromEvent(
            lastPointerClientRef.current.x,
            lastPointerClientRef.current.y,
            true
          );
        }
        break;
      case '0':
        event.preventDefault();
        fitToDrawing();
        break;
      case '1':
        event.preventDefault();
        setActualScale();
        break;
      case 'g':
      case 'G':
        event.preventDefault();
        handleGridToggle();
        break;
      case 'm':
      case 'M':
        event.preventDefault();
        toggleMeasurementMode('shortcut');
        break;
      case 'a':
      case 'A':
        event.preventDefault();
        handleViewModeChange(viewMode === 'annotate' ? 'pan' : 'annotate', 'shortcut');
        break;
      case 'Delete':
      case 'Backspace':
        if (selectedMeasurementId) {
          event.preventDefault();
          removeSelectedMeasurement();
        }
        break;
      case 'Escape':
        event.preventDefault();
        if (viewMode === 'annotate') {
          exitAnnotationMode();
        } else if (viewMode === 'measure-distance') {
          if (isDraftMeasurementActive(draftMeasurement)) {
            resetDraftMeasurement('placing-start');
          } else {
            handleViewModeChange('pan', 'shortcut');
          }
        }
        break;
      default:
        break;
    }
  };

  const handleKeyUp = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (
      event.key === 'Shift' &&
      viewMode === 'measure-distance' &&
      draftMeasurement.status === 'placing-end' &&
      lastPointerClientRef.current
    ) {
      updateCursorAndDraftFromEvent(
        lastPointerClientRef.current.x,
        lastPointerClientRef.current.y,
        false
      );
    }
  };

  const stageStyle =
    loadedDocument && containerSize.width > 0 && containerSize.height > 0
      ? `translate(${viewport.translateX} ${viewport.translateY}) scale(${viewport.scale})`
      : undefined;

  const measurementUnit = settings.viewer.measurementUnit;
  const draftPreview = getDraftMeasurementPreview(draftMeasurement, measurementUnit);
  const measureSummary = draftPreview?.readout ?? null;
  const canInteract = !!loadedDocument && documentState.status !== 'loading';
  const measurementItems = useMemo<MeasurementListItemData[]>(
    () =>
      measurements.map((measurement) => {
        const midpoint = getMeasurementMidpoint(measurement);
        return {
          id: measurement.id,
          title: measurement.id.slice(-6),
          summary: formatMeasurementReadout(measurement, measurementUnit),
          detail: `midpoint ${formatCoordinate(midpoint)}`,
          selected: measurement.id === selectedMeasurementId,
        };
      }),
    [measurements, selectedMeasurementId, measurementUnit]
  );
  return (
    <div className="flex flex-col h-full w-full" data-testid="preview-2d-root">
      <div className="flex flex-row flex-1 min-h-0">
        {!isMobile && (
          <Svg2DToolPalette
            mode={viewMode}
            onModeChange={(mode) => handleViewModeChange(mode, 'toolbar')}
            canInteract={canInteract}
          />
        )}
        <div
          ref={containerRef}
          className="relative flex-1 min-w-0 outline-none"
          style={{ backgroundColor: themeColors.background, touchAction: 'none' }}
          data-preview-root={viewerId ?? 'default-preview'}
          data-testid="preview-2d-container"
          tabIndex={0}
          onKeyDown={handleKeyDown}
          onKeyUp={handleKeyUp}
          onWheel={handleWheel}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerLeave}
          onDoubleClick={() => {
            if (viewMode === 'pan') {
              fitToDrawing();
            }
          }}
          onClick={handleClick}
        >
          <div
            className="absolute top-2 right-2 z-20 flex gap-2"
            onClick={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
          >
            <IconButton
              aria-label="Zoom in"
              title="Zoom in"
              data-testid="preview-2d-zoom-in"
              disabled={!canInteract || viewMode === 'annotate'}
              onClick={() => adjustZoom(1.15)}
              style={{
                backgroundColor: 'var(--bg-elevated)',
                border: '1px solid var(--border-secondary)',
              }}
            >
              <TbZoomIn size={18} />
            </IconButton>
            <IconButton
              aria-label="Zoom out"
              title="Zoom out"
              data-testid="preview-2d-zoom-out"
              disabled={!canInteract || viewMode === 'annotate'}
              onClick={() => adjustZoom(1 / 1.15)}
              style={{
                backgroundColor: 'var(--bg-elevated)',
                border: '1px solid var(--border-secondary)',
              }}
            >
              <TbZoomOut size={18} />
            </IconButton>
            <IconButton
              aria-label="Fit to drawing"
              title="Fit to drawing"
              data-testid="preview-2d-fit"
              disabled={!canInteract || viewMode === 'annotate'}
              onClick={fitToDrawing}
              style={{
                backgroundColor: 'var(--bg-elevated)',
                border: '1px solid var(--border-secondary)',
              }}
            >
              <TbFocus2 size={18} />
            </IconButton>
            <ToolbarTextButton
              label="1:1"
              title="Reset to 100% scale"
              onClick={setActualScale}
              disabled={!canInteract || viewMode === 'annotate'}
              testId="preview-2d-actual-size"
            />
            <IconButton
              aria-label="Annotate preview"
              title="Annotate preview"
              data-testid="preview-2d-toggle-annotate"
              disabled={!canInteract}
              onClick={() =>
                handleViewModeChange(viewMode === 'annotate' ? 'pan' : 'annotate', 'toolbar')
              }
              isActive={viewMode === 'annotate'}
              style={{
                backgroundColor:
                  viewMode === 'annotate' ? 'var(--bg-tertiary)' : 'var(--bg-elevated)',
                border: '1px solid var(--border-secondary)',
                color: viewMode === 'annotate' ? 'var(--text-primary)' : 'var(--text-secondary)',
              }}
            >
              <TbBrush size={18} />
            </IconButton>
            <IconButton
              aria-label="Toggle grid"
              title="Toggle grid"
              data-testid="preview-2d-toggle-grid"
              disabled={!canInteract}
              onClick={handleGridToggle}
              style={{
                backgroundColor: settings.viewer.show2DGrid
                  ? 'var(--bg-tertiary)'
                  : 'var(--bg-elevated)',
                border: '1px solid var(--border-secondary)',
                color: settings.viewer.show2DGrid ? 'var(--text-primary)' : 'var(--text-secondary)',
              }}
            >
              <TbGrid3X3 size={18} />
            </IconButton>
          </div>

          <div aria-live="polite" className="sr-only">
            {liveMessage}
          </div>

          {documentState.status === 'loading' ? (
            <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
              <div
                className="rounded-lg px-4 py-3 flex items-center gap-3"
                style={{
                  backgroundColor: 'rgba(0, 0, 0, 0.3)',
                  color: 'var(--text-secondary)',
                  border: '1px solid var(--border-secondary)',
                  backdropFilter: 'blur(6px)',
                }}
              >
                <div
                  className="animate-spin h-5 w-5 border-2 rounded-full"
                  style={{
                    borderColor: 'var(--border-primary)',
                    borderTopColor: 'var(--accent-primary)',
                  }}
                />
                <span className="text-sm">Loading 2D preview...</span>
              </div>
            </div>
          ) : null}

          {loadedDocument ? (
            <div className="absolute inset-0 overflow-hidden" data-testid="preview-2d-viewport">
              <svg
                className="absolute inset-0 h-full w-full select-none"
                viewBox={`0 0 ${Math.max(containerSize.width, 1)} ${Math.max(containerSize.height, 1)}`}
                preserveAspectRatio="none"
                overflow="hidden"
                style={{
                  cursor:
                    viewMode === 'measure-distance' || viewMode === 'annotate'
                      ? 'crosshair'
                      : dragRef.current
                        ? 'grabbing'
                        : 'grab',
                }}
                data-testid="preview-2d-scene"
              >
                <g transform={stageStyle} data-testid="preview-2d-stage">
                  {overlayModel ? (
                    <g data-testid="preview-2d-grid-overlay" aria-hidden="true">
                      {overlayModel.minorGridLines.map((line) => (
                        <line
                          key={line.key}
                          x1={line.x1}
                          y1={line.y1}
                          x2={line.x2}
                          y2={line.y2}
                          stroke={themeColors.minorGrid}
                          strokeOpacity={0.28}
                          strokeWidth={0.5}
                          vectorEffect="non-scaling-stroke"
                        />
                      ))}

                      {overlayModel.majorGridLines.map((line) => (
                        <line
                          key={line.key}
                          x1={line.x1}
                          y1={line.y1}
                          x2={line.x2}
                          y2={line.y2}
                          stroke={themeColors.majorGrid}
                          strokeOpacity={0.52}
                          strokeWidth={0.75}
                          vectorEffect="non-scaling-stroke"
                        />
                      ))}
                    </g>
                  ) : null}

                  {overlayModel ? (
                    <g data-testid="preview-2d-axis-overlay" aria-hidden="true">
                      {overlayModel.axesLines.map((line) => (
                        <line
                          key={line.key}
                          x1={line.x1}
                          y1={line.y1}
                          x2={line.x2}
                          y2={line.y2}
                          stroke={line.tone === 'axis-x' ? themeColors.xAxis : themeColors.yAxis}
                          strokeOpacity={0.85}
                          strokeWidth={1.25}
                          vectorEffect="non-scaling-stroke"
                          data-axis={line.tone === 'axis-x' ? 'x' : 'y'}
                        />
                      ))}
                    </g>
                  ) : null}

                  <g data-preview-svg dangerouslySetInnerHTML={{ __html: loadedDocument.markup }} />

                  {overlayModel ? (
                    <g data-testid="preview-2d-overlay">
                      {overlayModel.boundsRect ? (
                        <rect
                          x={overlayModel.boundsRect.x}
                          y={overlayModel.boundsRect.y}
                          width={overlayModel.boundsRect.width}
                          height={overlayModel.boundsRect.height}
                          fill="none"
                          stroke={themeColors.bounds}
                          strokeDasharray="4 3"
                          strokeWidth={1}
                          vectorEffect="non-scaling-stroke"
                        />
                      ) : null}

                      {overlayModel.committedMeasurements.map((measurement) => (
                        <g key={measurement.id} data-testid="preview-2d-committed-measurement">
                          <line
                            x1={measurement.line.x1}
                            y1={measurement.line.y1}
                            x2={measurement.line.x2}
                            y2={measurement.line.y2}
                            stroke={
                              measurement.selected
                                ? themeColors.measureSelected
                                : themeColors.measure
                            }
                            strokeOpacity={measurement.selected ? 1 : 0.9}
                            strokeWidth={measurement.selected ? 2 : 1.5}
                            vectorEffect="non-scaling-stroke"
                          />
                          {[measurement.startMarker, measurement.endMarker].map((marker) => (
                            <circle
                              key={marker.key}
                              cx={marker.cx}
                              cy={marker.cy}
                              r={marker.r}
                              fill={
                                marker.tone === 'measure-selected'
                                  ? themeColors.measureSelected
                                  : themeColors.measure
                              }
                            />
                          ))}
                          <g
                            data-testid={`preview-2d-measurement-item-${measurement.id}`}
                            onClick={(event) => {
                              event.stopPropagation();
                              selectMeasurement(measurement.id);
                            }}
                            style={{ cursor: 'pointer' }}
                          >
                            <rect
                              x={measurement.labelBox.x}
                              y={measurement.labelBox.y}
                              width={measurement.labelBox.width}
                              height={measurement.labelBox.height}
                              rx={4 / Math.max(viewport.scale, 0.0001)}
                              fill={themeColors.labelBackground}
                              opacity={measurement.selected ? 0.95 : 0.82}
                              stroke={
                                measurement.selected
                                  ? themeColors.measureSelected
                                  : themeColors.measure
                              }
                              strokeOpacity={measurement.selected ? 0.95 : 0.55}
                              strokeWidth={1 / Math.max(viewport.scale, 0.0001)}
                            />
                            <text
                              x={measurement.label.x}
                              y={measurement.label.y}
                              textAnchor={measurement.label.anchor ?? 'start'}
                              fill={
                                measurement.selected
                                  ? themeColors.measureSelected
                                  : themeColors.measure
                              }
                              fontSize={12 / Math.max(viewport.scale, 0.0001)}
                              fontFamily="monospace"
                              dominantBaseline="middle"
                              data-testid="preview-2d-measurement-label"
                            >
                              {measurement.label.text}
                            </text>
                          </g>
                        </g>
                      ))}

                      {overlayModel.draftMeasurementLine ? (
                        <line
                          x1={overlayModel.draftMeasurementLine.x1}
                          y1={overlayModel.draftMeasurementLine.y1}
                          x2={overlayModel.draftMeasurementLine.x2}
                          y2={overlayModel.draftMeasurementLine.y2}
                          stroke={themeColors.measure}
                          strokeOpacity={0.9}
                          strokeWidth={1.5}
                          vectorEffect="non-scaling-stroke"
                          strokeDasharray="4 3"
                        />
                      ) : null}

                      {overlayModel.draftMeasurementMarkers.map((marker) => (
                        <circle
                          key={marker.key}
                          cx={marker.cx}
                          cy={marker.cy}
                          r={marker.r}
                          fill={themeColors.measure}
                        />
                      ))}

                      {overlayModel.draftSnapIndicator ? (
                        <circle
                          cx={overlayModel.draftSnapIndicator.cx}
                          cy={overlayModel.draftSnapIndicator.cy}
                          r={overlayModel.draftSnapIndicator.r}
                          fill="none"
                          stroke={themeColors.measure}
                          strokeOpacity={0.8}
                          strokeWidth={1.2}
                          vectorEffect="non-scaling-stroke"
                          data-testid="preview-2d-snap-indicator"
                        />
                      ) : null}

                      {[...overlayModel.boundsLabels].map((label) => (
                        <text
                          key={label.key}
                          x={label.x}
                          y={label.y}
                          textAnchor={label.anchor ?? 'start'}
                          fill={themeColors.labelText}
                          fontSize={10 / Math.max(viewport.scale, 0.0001)}
                          fontFamily="monospace"
                          paintOrder="stroke"
                          stroke={themeColors.labelBackground}
                          strokeWidth={2 / Math.max(viewport.scale, 0.0001)}
                        >
                          {label.text}
                        </text>
                      ))}

                      {overlayModel.draftMeasurementLabel ? (
                        <text
                          x={overlayModel.draftMeasurementLabel.x}
                          y={overlayModel.draftMeasurementLabel.y}
                          textAnchor={overlayModel.draftMeasurementLabel.anchor ?? 'start'}
                          fill={themeColors.measure}
                          fontSize={12 / Math.max(viewport.scale, 0.0001)}
                          fontFamily="monospace"
                          paintOrder="stroke"
                          stroke={themeColors.labelBackground}
                          strokeWidth={2 / Math.max(viewport.scale, 0.0001)}
                          dominantBaseline="middle"
                        >
                          {overlayModel.draftMeasurementLabel.text}
                        </text>
                      ) : null}

                      {overlayModel.draftSnapLabel ? (
                        <text
                          x={overlayModel.draftSnapLabel.x}
                          y={overlayModel.draftSnapLabel.y}
                          textAnchor={overlayModel.draftSnapLabel.anchor ?? 'start'}
                          fill={themeColors.measure}
                          fontSize={11 / Math.max(viewport.scale, 0.0001)}
                          fontFamily="monospace"
                          paintOrder="stroke"
                          stroke={themeColors.labelBackground}
                          strokeWidth={2 / Math.max(viewport.scale, 0.0001)}
                          dominantBaseline="middle"
                        >
                          {overlayModel.draftSnapLabel.text}
                        </text>
                      ) : null}
                    </g>
                  ) : null}
                </g>
              </svg>
            </div>
          ) : null}

          {loadedDocument &&
          viewMode === 'annotate' &&
          containerSize.width > 0 &&
          containerSize.height > 0 ? (
            <AnnotationOverlay
              surface={containerSize}
              shapes={annotationSession.shapes}
              draft={annotationSession.draft}
              onStageReady={(stage) => {
                annotationStageRef.current = stage;
              }}
              onStart={(point) => {
                annotationSession.beginDraft(normalizeViewerPoint(point, containerSize));
              }}
              onMove={(point) => {
                if (!annotationSession.draft) {
                  return;
                }
                annotationSession.updateDraft(normalizeViewerPoint(point, containerSize));
              }}
              onEnd={handleAnnotationCommit}
            />
          ) : null}

          {documentState.status === 'idle' ? (
            <StatusCard
              title="No 2D preview"
              detail="Render a 2D OpenSCAD model to see the SVG viewer."
            />
          ) : null}

          {documentState.status === 'empty' && !loadedDocument ? (
            <StatusCard
              title="No 2D output"
              detail="The render completed but did not produce any visible 2D geometry."
              helperText="If this model relies on a custom font that is not bundled on web, switch to Liberation Sans, Liberation Serif, Liberation Mono, sans-serif, serif, or monospace."
            />
          ) : null}

          {documentState.status === 'error' && !loadedDocument ? (
            <StatusCard
              title="Couldn't load SVG preview"
              detail={documentState.error}
              helperText="The preview surface stays isolated so a failed SVG load does not break the rest of the app."
            />
          ) : null}

          {loadedDocument && documentState.status === 'empty' ? (
            <div
              className="absolute left-3 top-3 z-20 px-3 py-2 rounded-md text-xs"
              style={{
                backgroundColor: themeColors.bannerBackground,
                border: '1px solid var(--border-primary)',
                color: 'var(--text-secondary)',
              }}
              data-testid="preview-2d-empty-banner"
            >
              No visible 2D geometry. If this model depends on a custom web-unsupported font, try a
              bundled family such as Liberation Sans, Liberation Serif, Liberation Mono, or the
              generic sans-serif, serif, or monospace families.
            </div>
          ) : null}

          {loadedDocument && documentState.status === 'error' ? (
            <div
              className="absolute left-3 top-3 z-20 px-3 py-2 rounded-md text-xs max-w-md"
              style={{
                backgroundColor: themeColors.bannerBackground,
                border: '1px solid var(--border-primary)',
                color: 'var(--text-secondary)',
              }}
              data-testid="preview-2d-error-banner"
            >
              Couldn&apos;t load SVG preview. Showing the last successful 2D preview instead.
            </div>
          ) : null}

          {loadedDocument &&
          documentState.warnings.length > 0 &&
          documentState.status !== 'error' ? (
            <div
              className="absolute left-3 bottom-3 z-20 px-3 py-2 rounded-md text-xs max-w-lg"
              style={{
                backgroundColor: themeColors.bannerBackground,
                border: '1px solid var(--border-primary)',
                color: 'var(--text-secondary)',
              }}
            >
              {documentState.warnings[0]}
            </div>
          ) : null}

          {loadedDocument && settings.viewer.show2DCursorCoords && cursorPoint ? (
            <div
              className="absolute right-3 bottom-3 z-20 px-3 py-2 rounded-md text-xs font-medium"
              style={{
                backgroundColor: themeColors.bannerBackground,
                border: '1px solid var(--border-primary)',
                color: 'var(--text-secondary)',
              }}
              data-testid="preview-2d-coordinate-readout"
            >
              {formatCoordinate(cursorPoint)}
            </div>
          ) : null}

          {viewMode === 'annotate' ? (
            <AnnotationPanel
              tool={annotationSession.tool}
              onToolChange={annotationSession.setTool}
              onUndo={annotationSession.undoLast}
              onClear={handleAnnotationClear}
              onCancel={exitAnnotationMode}
              onAttach={handleAnnotationAttach}
              canUndo={Boolean(annotationSession.draft) || annotationSession.shapes.length > 0}
              canClear={Boolean(annotationSession.draft) || annotationSession.shapes.length > 0}
              canAttach={
                !isAttachingAnnotation && canAttachToAi && annotationSession.shapes.length > 0
              }
              attachLabel={
                !hasCurrentModelApiKey
                  ? 'Add API Key'
                  : isAttachingAnnotation
                    ? 'Attaching...'
                    : 'Attach to AI'
              }
            />
          ) : null}

          {!isMobile && viewMode === 'measure-distance' && (
            <ToolPanel key="measure" label="Measure">
              <Svg2DMeasurePanel
                draftMeasurement={draftMeasurement}
                measureSummary={measureSummary}
                measurementItems={measurementItems}
                onMeasurementSelect={selectMeasurement}
                onMeasurementDelete={(id) => {
                  setMeasurements((existing) => existing.filter((item) => item.id !== id));
                  if (selectedMeasurementId === id) {
                    setSelectedMeasurementId(null);
                  }
                  setLiveMessage('Measurement deleted');
                }}
                onMeasurementsClear={clearAllMeasurements}
              />
            </ToolPanel>
          )}
        </div>
      </div>
    </div>
  );
}
