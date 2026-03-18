import { useEffect, useMemo, useRef, useState } from 'react';
import { TbFocus2, TbZoomIn, TbZoomOut } from 'react-icons/tb';
import { useTheme } from '../contexts/ThemeContext';
import { getPreviewSceneStyle } from '../services/previewSceneConfig';
import { Button, IconButton, Text } from './ui';
import { MeasurementsTray } from './viewer-measurements/MeasurementsTray';
import type { MeasurementListItemData } from './viewer-measurements/types';
import { updateSetting, useSettings } from '../stores/settingsStore';
import { buildOverlayModel } from './svg-viewer/overlayModel';
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

interface SvgViewerProps {
  src: string;
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
    <Button
      type="button"
      size="sm"
      variant="secondary"
      onClick={onClick}
      disabled={disabled}
      aria-label={title}
      title={title}
      data-testid={testId}
      style={{
        backgroundColor: active ? 'var(--bg-tertiary)' : undefined,
        color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
      }}
    >
      {label}
    </Button>
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
        <Text variant="panel-title" weight="medium" as="p" className="mb-2">{title}</Text>
        <Text variant="body" className="whitespace-pre-wrap">{detail}</Text>
        {helperText ? (
          <Text variant="caption" color="tertiary" className="mt-3">
            {helperText}
          </Text>
        ) : null}
      </div>
    </div>
  );
}

export function SvgViewer({ src }: SvgViewerProps) {
  const { theme } = useTheme();
  const [settings] = useSettings();
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
  const containerRef = useRef<HTMLDivElement | null>(null);
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
  const sceneStyle = useMemo(() => getPreviewSceneStyle(theme), [theme]);

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
        const parsed = parseSvgMetrics(text);
        if (cancelled) {
          return;
        }

        setLoadedDocument(parsed);
        setDocumentState({
          status: parsed.metrics.isEmpty ? 'empty' : 'ready',
          error: '',
          helperText: parsed.metrics.isEmpty
            ? 'OpenSCAD WASM can produce empty 2D output for some features, especially text() when fonts are unavailable.'
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
  }, [src]);

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

  const toggleMeasurementMode = () => {
    setViewMode((current) => {
      const nextMode = current === 'measure-distance' ? 'pan' : 'measure-distance';
      resetDraftMeasurement(nextMode === 'measure-distance' ? 'placing-start' : 'idle');
      return nextMode;
    });
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
    if (documentState.status === 'loading' || !loadedDocument) {
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
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    updateCursorAndDraftFromEvent(event.clientX, event.clientY, event.shiftKey);

    if (!dragRef.current) {
      return;
    }

    const deltaX = event.clientX - dragRef.current.startX;
    const deltaY = event.clientY - dragRef.current.startY;
    if (Math.abs(deltaX) > 2 || Math.abs(deltaY) > 2) {
      dragRef.current.moved = true;
    }

    setViewport((current) =>
      sanitizeViewport({
        ...current,
        translateX: dragRef.current!.originTranslateX + deltaX,
        translateY: dragRef.current!.originTranslateY + deltaY,
        fitMode: 'custom',
        interactionSource: 'pan',
      })
    );
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
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
    if (!loadedDocument || documentState.status === 'loading') {
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
        toggleMeasurementMode();
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
        if (viewMode === 'measure-distance') {
          if (isDraftMeasurementActive(draftMeasurement)) {
            resetDraftMeasurement('placing-start');
          } else {
            setViewMode('pan');
            resetDraftMeasurement();
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
  const measurementHelpCopy =
    viewMode === 'measure-distance'
      ? draftMeasurement.status === 'placing-end' && draftMeasurement.start
        ? 'Click again to finish. Hold Shift to lock angle in 15 degree steps. Esc to cancel. Delete removes the selected measurement.'
        : 'Click to place start. Hold Shift after placing a point to lock angle in 15 degree steps. Esc exits measure mode. Delete removes the selected measurement.'
      : null;

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full outline-none"
      style={{ backgroundColor: themeColors.background }}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onKeyUp={handleKeyUp}
      onWheel={handleWheel}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerLeave}
      onDoubleClick={() => {
        if (viewMode !== 'measure-distance') {
          fitToDrawing();
        }
      }}
      onClick={handleClick}
      data-testid="preview-2d-root"
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
          disabled={!canInteract}
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
          disabled={!canInteract}
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
          disabled={!canInteract}
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
          disabled={!canInteract}
          testId="preview-2d-actual-size"
        />
        <ToolbarTextButton
          label="Grid"
          title="Toggle grid"
          active={settings.viewer.show2DGrid}
          onClick={handleGridToggle}
          disabled={!canInteract}
          testId="preview-2d-toggle-grid"
        />
        <ToolbarTextButton
          label="Measure"
          title="Measure distance"
          active={viewMode === 'measure-distance'}
          onClick={toggleMeasurementMode}
          disabled={!canInteract}
          testId="preview-2d-toggle-measure"
        />
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
                viewMode === 'measure-distance'
                  ? 'crosshair'
                  : dragRef.current
                    ? 'grabbing'
                    : 'grab',
            }}
            data-testid="preview-2d-scene"
          >
            <g transform={stageStyle} data-testid="preview-2d-stage">
              <g data-preview-svg dangerouslySetInnerHTML={{ __html: loadedDocument.markup }} />

              {overlayModel ? (
                <g data-testid="preview-2d-overlay">
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
                          measurement.selected ? themeColors.measureSelected : themeColors.measure
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
                            measurement.selected ? themeColors.measureSelected : themeColors.measure
                          }
                          strokeOpacity={measurement.selected ? 0.95 : 0.55}
                          strokeWidth={1 / Math.max(viewport.scale, 0.0001)}
                        />
                        <text
                          x={measurement.label.x}
                          y={measurement.label.y}
                          textAnchor={measurement.label.anchor ?? 'start'}
                          fill={
                            measurement.selected ? themeColors.measureSelected : themeColors.measure
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

      {viewMode === 'measure-distance' && loadedDocument ? (
        <div
          className="absolute left-3 top-3 z-20 px-3 py-2 rounded-md text-xs max-w-md"
          style={{
            backgroundColor: themeColors.bannerBackground,
            border: '1px solid var(--border-primary)',
            color: 'var(--text-secondary)',
          }}
          data-testid="preview-2d-measure-help"
        >
          {measurementHelpCopy}
        </div>
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
          helperText="OpenSCAD WASM can produce empty output for some features, including text() when fonts are unavailable."
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
          No visible 2D geometry. OpenSCAD WASM text rendering may be limited when fonts are
          unavailable.
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

      {loadedDocument && documentState.warnings.length > 0 && documentState.status !== 'error' ? (
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

      {loadedDocument && viewMode === 'measure-distance' && measureSummary ? (
        <div
          className="absolute right-3 top-16 z-20 px-3 py-2 rounded-md text-xs font-medium"
          style={{
            backgroundColor: themeColors.bannerBackground,
            border: '1px solid var(--border-primary)',
            color: 'var(--text-secondary)',
          }}
          data-testid="preview-2d-measurement-readout"
        >
          {measureSummary}
        </div>
      ) : null}

      {loadedDocument ? (
        <MeasurementsTray
          items={measurementItems}
          containerTestId="preview-2d-measurements-tray"
          clearAllTestId="preview-2d-clear-measurements"
          itemTestId="preview-2d-measurement-list-item"
          deleteTestId="preview-2d-delete-measurement"
          onClearAll={clearAllMeasurements}
          onSelect={selectMeasurement}
          onDelete={(id) => {
            setMeasurements((existing) => existing.filter((item) => item.id !== id));
            if (selectedMeasurementId === id) {
              setSelectedMeasurementId(null);
            }
            setLiveMessage('Measurement deleted');
          }}
        />
      ) : null}
    </div>
  );
}
