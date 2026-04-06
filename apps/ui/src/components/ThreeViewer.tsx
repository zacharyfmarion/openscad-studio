import { Component, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import {
  CameraControls,
  ContactShadows,
  Environment,
  GizmoHelper,
  GizmoViewcube,
  Grid,
  Html,
  Line,
  OrthographicCamera,
  PerspectiveCamera,
} from '@react-three/drei';
import type { CameraControls as CameraControlsType } from '@react-three/drei';
import * as THREE from 'three';
import { useTheme } from '../contexts/ThemeContext';
import { getPreviewSceneStyle, type PreviewSceneStyle } from '../services/previewSceneConfig';
import {
  boxFitsCameraView,
  boxUnderfillsCameraView,
  derivePreviewAxisMetrics,
  derivePreviewFramingMetrics,
  derivePreviewGridMetrics,
  getExpandedFitBox,
  getFitPaddingOptions,
  SIGNIFICANT_SHRINK_RATIO,
  type ModelFrame,
} from '../services/previewFraming';
import {
  createPreviewAxesOverlay,
  disposePreviewAxesOverlay,
  type PreviewAxisLabelVisibility,
} from '../services/previewAxes';
import {
  buildPreview3dObject,
  loadOffPreviewModelFromUrl,
  type BuiltPreview3dObject,
  type ParsedPreview3dModel,
} from '../services/preview3dModel';
import { threeToOpenScadDelta } from '../services/coordinateTransform';
import { createViewerInteractionConfig } from './viewerInteractionConfig';
import { ViewerToolPalette } from './three-viewer/ViewerToolPalette';
import { VIEWER_TOOLS } from './three-viewer/viewerToolRegistry';
import { ToolPanel } from './three-viewer/panels/ToolPanel';
import {
  createMeasurementRecord3D,
  formatMeasurementSummary3D,
  getMeasurementMidpoint3D,
  resolveMeasurementPick3D,
} from './three-viewer/measurementController3d';
import { ViewerMaterialManager } from './three-viewer/materialManager';
import {
  createSelectionStateFromRaycast,
  robustRaycastLoadedModel,
  type RaycastResult,
} from './three-viewer/selectionController';
import {
  clampSectionOffset,
  createClippingPlane,
  createDefaultSectionPlaneState,
  getSectionAxisBounds,
  getSectionPlaneVisualTransform,
} from './three-viewer/sectionPlaneController';
import { useThreeViewerAnalytics } from './three-viewer/useThreeViewerAnalytics';
import { useAnalytics } from '../analytics/runtime';
import type {
  InteractionMode,
  LoadedPreviewModel,
  MeasurementDraft3D,
  MeasurementRecord3D,
  SectionAxis,
  SectionPlaneState,
  SelectionState,
} from './three-viewer/types';
import { TbBox, TbBoxModel, TbBrush, TbFocus2, TbSun, TbX } from 'react-icons/tb';
import type { ToolContextPanelProps } from './three-viewer/types';
import { updateSetting, useSettings } from '../stores/settingsStore';
import { IconButton, Text } from './ui';
import { useMobileLayout } from '../hooks/useMobileLayout';
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
import { notifyError, notifySuccess } from '../utils/notifications';
import type Konva from 'konva';

interface ThreeViewerProps {
  preview3dPath: string;
  isLoading?: boolean;
  viewerId?: string;
  onVisualReady?: () => void;
  hasCurrentModelApiKey: boolean;
  canAttachToAi: boolean;
  onAttachToAi: (file: File) => Promise<ViewerAnnotationAttachResult>;
}

const introAnimatedViewerIds = new Set<string>();

const EMPTY_SELECTION: SelectionState = {
  objectUuid: null,
  point: null,
  normal: null,
  bounds: null,
};

const INITIAL_DRAFT: MeasurementDraft3D = {
  status: 'idle',
  start: null,
  current: null,
  snapKind: null,
  axisLock: null,
};

declare global {
  interface Window {
    __TEST_PREVIEW__?: {
      currentFits: boolean;
      fitCount: number;
      maxDim: number | null;
      modelVersion: string | null;
      orthographic: boolean;
      cameraFar: number | null;
      cameraZoom: number | null;
      gridCellSize: number | null;
      gridSectionSize: number | null;
      axisExtent: number | null;
      axisMinorStep: number | null;
      axisMajorStep: number | null;
      axisLabelStep: number | null;
      axesVisible: boolean;
      axisLabelsVisible: boolean;
      cameraPosition: [number, number, number] | null;
      cameraTarget: [number, number, number] | null;
      interactionMode: InteractionMode;
      selectionActive: boolean;
      measurementCount: number;
      sectionEnabled: boolean;
      sectionAxis: SectionAxis | null;
      sectionOffset: number | null;
    };
  }
}

function formatVector3(vector: THREE.Vector3 | null) {
  if (!vector) {
    return 'n/a';
  }

  const formatValue = (value: number) =>
    (Math.abs(value) >= 100 ? value.toFixed(1) : value.toFixed(2))
      .replace(/\.00$/, '')
      .replace(/(\.\d)0$/, '$1');

  return `x ${formatValue(vector.x)}  y ${formatValue(vector.y)}  z ${formatValue(vector.z)}`;
}

function Preview3DModel({
  url,
  wireframe,
  sceneStyle,
  useModelColors,
  onModelFrameChange,
  onModelChange,
}: {
  url: string;
  wireframe: boolean;
  sceneStyle: PreviewSceneStyle;
  useModelColors: boolean;
  onModelFrameChange: (frame: ModelFrame | null) => void;
  onModelChange: (model: LoadedPreviewModel | null) => void;
}) {
  const [parsedModel, setParsedModel] = useState<ParsedPreview3dModel | null>(null);

  useEffect(() => {
    let cancelled = false;
    void loadOffPreviewModelFromUrl({
      url,
      fallbackColor: sceneStyle.modelColor,
      version: url,
    })
      .then((model) => {
        if (cancelled) {
          model.dispose();
          return;
        }

        setParsedModel((previousModel) => {
          previousModel?.dispose();
          return model;
        });
      })
      .catch((error) => {
        if (!cancelled) {
          onModelFrameChange(null);
          onModelChange(null);
          console.error('Error loading OFF preview:', error);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [onModelChange, onModelFrameChange, sceneStyle.modelColor, url]);

  useEffect(() => {
    return () => {
      parsedModel?.dispose();
      onModelChange(null);
      onModelFrameChange(null);
    };
  }, [onModelChange, onModelFrameChange, parsedModel]);

  const builtModel = useMemo<BuiltPreview3dObject | null>(() => {
    if (!parsedModel) {
      return null;
    }

    return buildPreview3dObject({
      parsed: parsedModel,
      sceneStyle,
      useModelColors,
      wireframe,
    });
  }, [parsedModel, sceneStyle, useModelColors, wireframe]);

  useEffect(() => {
    if (!builtModel || !parsedModel) {
      return;
    }

    onModelFrameChange(parsedModel.frame);
    onModelChange({
      root: builtModel.root,
      meshes: builtModel.meshes,
      bounds: parsedModel.frame.box.clone(),
      size: parsedModel.frame.size.clone(),
      center: parsedModel.frame.center.clone(),
      diagonal: parsedModel.frame.size.length(),
      version: parsedModel.frame.version,
    });
  }, [builtModel, onModelChange, onModelFrameChange, parsedModel]);

  useEffect(
    () => () => {
      builtModel?.dispose();
    },
    [builtModel]
  );

  if (!builtModel) {
    return null;
  }

  return <primitive object={builtModel.root} />;
}

function SelectionBoundsOverlay({
  bounds,
  color,
  opacity = 0.9,
}: {
  bounds: THREE.Box3;
  color: string;
  opacity?: number;
}) {
  const { center, size } = useMemo(() => {
    const safeSize = bounds.getSize(new THREE.Vector3());
    return {
      center: bounds.getCenter(new THREE.Vector3()),
      size: new THREE.Vector3(
        Math.max(safeSize.x, 0.001),
        Math.max(safeSize.y, 0.001),
        Math.max(safeSize.z, 0.001)
      ),
    };
  }, [bounds]);

  return (
    <mesh position={center.toArray()} renderOrder={25}>
      <boxGeometry args={[size.x, size.y, size.z]} />
      <meshBasicMaterial color={color} wireframe transparent opacity={opacity} depthTest={false} />
    </mesh>
  );
}

function MeasurementOverlay3D({
  measurements,
  draft,
  selectedMeasurementId,
  model,
  accentColor,
  accentHoverColor,
  unit,
}: {
  measurements: MeasurementRecord3D[];
  draft: MeasurementDraft3D;
  selectedMeasurementId: string | null;
  model: LoadedPreviewModel | null;
  accentColor: string;
  accentHoverColor: string;
  unit: import('../stores/settingsStore').MeasurementUnit;
}) {
  const markerRadius = Math.max((model?.diagonal ?? 10) * 0.008, 0.15);

  return (
    <group name="overlayContainer">
      {measurements.map((measurement) => {
        const selected = measurement.id === selectedMeasurementId;
        const color = selected ? accentHoverColor : accentColor;
        const midpoint = getMeasurementMidpoint3D(measurement);
        return (
          <group key={measurement.id}>
            <Line
              points={[measurement.start.toArray(), measurement.end.toArray()]}
              color={color}
              lineWidth={selected ? 2.5 : 1.5}
            />
            {[measurement.start, measurement.end].map((point, index) => (
              <Html
                key={`${measurement.id}-${index}`}
                position={point.toArray()}
                style={{ pointerEvents: 'none' }}
              >
                <div
                  style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    backgroundColor: color,
                    transform: 'translate(-50%, -50%)',
                    boxSizing: 'border-box',
                  }}
                />
              </Html>
            ))}
            <Html position={midpoint.toArray()} center distanceFactor={12}>
              <div
                style={{
                  padding: '3px 7px',
                  borderRadius: '5px',
                  border: '1px solid var(--border-primary)',
                  background: 'var(--bg-elevated)',
                  color: 'var(--text-primary)',
                  fontSize: '11px',
                  fontWeight: 500,
                  whiteSpace: 'nowrap',
                }}
              >
                {formatMeasurementSummary3D(measurement, unit)}
              </div>
            </Html>
          </group>
        );
      })}

      {draft.status === 'placing-end' && draft.start && draft.current ? (
        <group>
          <Line
            points={[draft.start.toArray(), draft.current.toArray()]}
            color={accentColor}
            lineWidth={1.5}
            dashed
            dashSize={markerRadius * 3}
            gapSize={markerRadius * 2}
          />
          {[draft.start, draft.current].map((point, index) => (
            <Html
              key={`draft-${index}`}
              position={point.toArray()}
              style={{ pointerEvents: 'none' }}
            >
              <div
                style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  backgroundColor: accentColor,
                  transform: 'translate(-50%, -50%)',
                  boxSizing: 'border-box',
                }}
              />
            </Html>
          ))}
          <Html
            position={getMeasurementMidpoint3D({
              start: draft.start,
              end: draft.current,
            }).toArray()}
            center
            distanceFactor={12}
          >
            <div
              style={{
                padding: '3px 7px',
                borderRadius: '5px',
                border: '1px solid var(--border-primary)',
                background: 'var(--bg-elevated)',
                color: 'var(--text-primary)',
                fontSize: '11px',
                fontWeight: 500,
                whiteSpace: 'nowrap',
              }}
            >
              {formatMeasurementSummary3D(
                createMeasurementRecord3D(draft.start, draft.current, 0),
                unit
              )}
            </div>
          </Html>
        </group>
      ) : null}

      {(draft.status === 'placing-start' || draft.status === 'placing-end') && draft.current ? (
        <Html position={draft.current.toArray()} style={{ pointerEvents: 'none' }}>
          <div style={{ position: 'relative', transform: 'translate(-50%, -50%)' }}>
            <div
              style={{
                width: '14px',
                height: '14px',
                borderRadius: '50%',
                border: `1.5px solid ${accentColor}`,
                boxSizing: 'border-box',
                opacity: 0.85,
              }}
            />
            {draft.snapKind ? (
              <div
                style={{
                  position: 'absolute',
                  bottom: '100%',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  marginBottom: '4px',
                  fontSize: '11px',
                  fontFamily: 'monospace',
                  color: accentColor,
                  whiteSpace: 'nowrap',
                  textShadow: '0 0 4px var(--bg-primary), 0 0 4px var(--bg-primary)',
                  lineHeight: 1,
                }}
              >
                Snap: {draft.snapKind}
              </div>
            ) : null}
          </div>
        </Html>
      ) : null}
    </group>
  );
}

function BBoxOverlay({ bounds }: { bounds: THREE.Box3 }) {
  const center = bounds.getCenter(new THREE.Vector3());
  const size = bounds.getSize(new THREE.Vector3());

  return (
    <group name="bboxOverlay">
      <SelectionBoundsOverlay bounds={bounds} color="#a855f7" opacity={0.8} />
      <Html position={[center.x + size.x / 2, center.y, center.z]} center distanceFactor={14}>
        <LabelBadge text={`X ${size.x.toFixed(2)}`} />
      </Html>
      <Html position={[center.x, center.y + size.y / 2, center.z]} center distanceFactor={14}>
        <LabelBadge text={`Z ${size.y.toFixed(2)}`} />
      </Html>
      <Html position={[center.x, center.y, center.z + size.z / 2]} center distanceFactor={14}>
        <LabelBadge text={`Y ${size.z.toFixed(2)}`} />
      </Html>
    </group>
  );
}

function LabelBadge({ text }: { text: string }) {
  return (
    <div
      style={{
        padding: '4px 8px',
        borderRadius: '6px',
        border: '1px solid var(--border-primary)',
        background: 'var(--bg-elevated)',
        color: 'var(--text-primary)',
        fontSize: '11px',
        fontWeight: 500,
        whiteSpace: 'nowrap',
      }}
    >
      {text}
    </div>
  );
}

function SectionPlaneOverlay({
  bounds,
  state,
  color,
}: {
  bounds: THREE.Box3;
  state: SectionPlaneState;
  color: string;
}) {
  const visual = useMemo(() => getSectionPlaneVisualTransform(bounds, state), [bounds, state]);

  return (
    <group name="sectionPlaneHelper">
      <mesh position={visual.position.toArray()} quaternion={visual.quaternion} renderOrder={22}>
        <planeGeometry args={[visual.size, visual.size]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.14}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
      <Html position={visual.position.toArray()} center distanceFactor={12}>
        <LabelBadge
          text={`Section ${{ x: 'X', y: 'Z', z: 'Y' }[state.axis] ?? state.axis.toUpperCase()}`}
        />
      </Html>
    </group>
  );
}

function ViewerInteractionController({
  mode,
  model,
  snapEnabled,
  draft,
  onHoverChange,
  onSelectionChange,
  onDraftChange,
  onCommitMeasurement,
}: {
  mode: InteractionMode;
  model: LoadedPreviewModel | null;
  snapEnabled: boolean;
  draft: MeasurementDraft3D;
  onHoverChange: (selection: SelectionState) => void;
  onSelectionChange: (selection: SelectionState) => void;
  onDraftChange: (draft: MeasurementDraft3D) => void;
  onCommitMeasurement: (measurement: MeasurementRecord3D) => void;
}) {
  const camera = useThree((state) => state.camera);
  const gl = useThree((state) => state.gl);
  const pointerDownRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const dom = gl.domElement;
    const raycaster = new THREE.Raycaster();

    const resolveRaycast = (event: PointerEvent): RaycastResult | null => {
      const rect = dom.getBoundingClientRect();
      return robustRaycastLoadedModel({
        clientX: event.clientX,
        clientY: event.clientY,
        rect,
        camera,
        model,
        raycaster,
      });
    };

    const handlePointerMove = (event: PointerEvent) => {
      if (mode === 'orbit' || mode === 'measure-bbox') {
        onHoverChange(createSelectionStateFromRaycast(model, resolveRaycast(event)));
        return;
      }

      if (mode !== 'measure-distance') {
        return;
      }

      const rect = dom.getBoundingClientRect();
      const hit = resolveRaycast(event);
      if (!hit) {
        return;
      }

      const resolved = resolveMeasurementPick3D({
        intersection: hit.intersection,
        camera,
        rect,
        clientX: event.clientX,
        clientY: event.clientY,
        snapEnabled,
        lockAxis: draft.status === 'placing-end' && event.shiftKey,
        start: draft.start,
        preferredAxis: draft.axisLock,
      });

      onDraftChange({
        ...draft,
        current: resolved.point.clone(),
        snapKind: resolved.snapKind,
        axisLock: draft.status === 'placing-end' ? resolved.axisLock : null,
      });
    };

    const handlePointerDown = (event: PointerEvent) => {
      pointerDownRef.current = { x: event.clientX, y: event.clientY };
    };

    const handlePointerLeave = () => {
      onHoverChange(EMPTY_SELECTION);
    };

    const handlePointerUp = (event: PointerEvent) => {
      if (!pointerDownRef.current) {
        return;
      }

      const moved =
        Math.hypot(
          event.clientX - pointerDownRef.current.x,
          event.clientY - pointerDownRef.current.y
        ) > 4;
      pointerDownRef.current = null;

      if (moved) {
        return;
      }

      const hit = resolveRaycast(event);
      if (!hit) {
        // Raycast can miss at silhouette edges/vertices due to floating-point precision in
        // Three.js triangle intersection. Fall back to the last known hover snap point so
        // that clicks exactly on edges and corners still place a measurement.
        if (mode === 'measure-distance' && draft.current) {
          if (draft.status !== 'placing-end' || !draft.start) {
            onDraftChange({
              status: 'placing-end',
              start: draft.current.clone(),
              current: draft.current.clone(),
              snapKind: draft.snapKind,
              axisLock: null,
            });
          } else {
            onCommitMeasurement(createMeasurementRecord3D(draft.start, draft.current));
            onDraftChange({
              status: 'placing-start',
              start: null,
              current: null,
              snapKind: draft.snapKind,
              axisLock: null,
            });
          }
          return;
        }
        if (mode === 'orbit') {
          onSelectionChange(EMPTY_SELECTION);
        }
        return;
      }

      if (mode === 'orbit' || mode === 'measure-bbox') {
        onSelectionChange(createSelectionStateFromRaycast(model, hit));
        return;
      }

      if (mode !== 'measure-distance') {
        return;
      }

      const rect = dom.getBoundingClientRect();
      const resolved = resolveMeasurementPick3D({
        intersection: hit.intersection,
        camera,
        rect,
        clientX: event.clientX,
        clientY: event.clientY,
        snapEnabled,
        lockAxis: event.shiftKey,
        start: draft.start,
        preferredAxis: draft.axisLock,
      });

      if (draft.status !== 'placing-end' || !draft.start) {
        onDraftChange({
          status: 'placing-end',
          start: resolved.point.clone(),
          current: resolved.point.clone(),
          snapKind: resolved.snapKind,
          axisLock: null,
        });
        return;
      }

      onCommitMeasurement(createMeasurementRecord3D(draft.start, resolved.point));
      onDraftChange({
        status: 'placing-start',
        start: null,
        current: null,
        snapKind: resolved.snapKind,
        axisLock: null,
      });
    };

    dom.addEventListener('pointermove', handlePointerMove);
    dom.addEventListener('pointerdown', handlePointerDown);
    dom.addEventListener('pointerup', handlePointerUp);
    dom.addEventListener('pointerleave', handlePointerLeave);

    return () => {
      dom.removeEventListener('pointermove', handlePointerMove);
      dom.removeEventListener('pointerdown', handlePointerDown);
      dom.removeEventListener('pointerup', handlePointerUp);
      dom.removeEventListener('pointerleave', handlePointerLeave);
    };
  }, [
    camera,
    draft,
    gl.domElement,
    mode,
    model,
    onCommitMeasurement,
    onDraftChange,
    onHoverChange,
    onSelectionChange,
    snapEnabled,
  ]);

  return null;
}

function ViewerCameraManager({
  cameraControlsRef,
  modelFrame,
  orthographic,
  sceneStyle,
  showAxes,
  showAxisLabels,
  animateInitialFrame,
  interactionMode,
  selectionActive,
  measurementCount,
  sectionState,
}: {
  cameraControlsRef: React.RefObject<CameraControlsType | null>;
  modelFrame: ModelFrame | null;
  orthographic: boolean;
  sceneStyle: PreviewSceneStyle;
  showAxes: boolean;
  showAxisLabels: boolean;
  animateInitialFrame: boolean;
  interactionMode: InteractionMode;
  selectionActive: boolean;
  measurementCount: number;
  sectionState: SectionPlaneState | null;
}) {
  const camera = useThree((state) => state.camera);
  const gl = useThree((state) => state.gl);
  const fitCountRef = useRef(0);
  const hasFramedOnceRef = useRef(false);
  const lastModelVersionRef = useRef<string | null>(null);
  const lastModelMaxDimRef = useRef<number | null>(null);
  const lastProjectionRef = useRef<boolean | null>(null);
  const latestModelFrameRef = useRef<ModelFrame | null>(modelFrame);
  const pendingAutoFitVersionRef = useRef<string | null>(null);
  const isUserControllingRef = useRef(false);
  const currentFitsRef = useRef(true);
  const isDevRuntime = Boolean((import.meta as ImportMeta & { env?: { DEV?: boolean } }).env?.DEV);

  latestModelFrameRef.current = modelFrame;

  const publishTestState = useCallback(
    (frame = latestModelFrameRef.current) => {
      if (!isDevRuntime) {
        return;
      }

      currentFitsRef.current = frame ? boxFitsCameraView(camera, frame.box) : true;
      const gridMetrics = derivePreviewGridMetrics(frame);
      const axisMetrics = derivePreviewAxisMetrics(frame, gridMetrics);
      const cameraControls = cameraControlsRef.current;
      const cameraPosition = cameraControls?.getPosition(new THREE.Vector3(), true) ?? null;
      const cameraTarget = cameraControls?.getTarget(new THREE.Vector3(), true) ?? null;

      window.__TEST_PREVIEW__ = {
        currentFits: currentFitsRef.current,
        fitCount: fitCountRef.current,
        maxDim: frame?.maxDim ?? null,
        modelVersion: frame?.version ?? null,
        orthographic,
        cameraFar:
          camera instanceof THREE.PerspectiveCamera || camera instanceof THREE.OrthographicCamera
            ? camera.far
            : null,
        cameraZoom:
          camera instanceof THREE.PerspectiveCamera || camera instanceof THREE.OrthographicCamera
            ? camera.zoom
            : null,
        gridCellSize: gridMetrics.cellSize,
        gridSectionSize: gridMetrics.sectionSize,
        axisExtent: axisMetrics.axisExtent,
        axisMinorStep: axisMetrics.minorStep,
        axisMajorStep: axisMetrics.majorStep,
        axisLabelStep: axisMetrics.labelStep,
        axesVisible: showAxes,
        axisLabelsVisible: showAxes && showAxisLabels,
        cameraPosition: cameraPosition ? tupleFromVector(cameraPosition) : null,
        cameraTarget: cameraTarget ? tupleFromVector(cameraTarget) : null,
        interactionMode,
        selectionActive,
        measurementCount,
        sectionEnabled: sectionState?.enabled ?? false,
        sectionAxis: sectionState?.axis ?? null,
        sectionOffset: sectionState?.enabled ? sectionState.offset : null,
      };
    },
    [
      camera,
      cameraControlsRef,
      isDevRuntime,
      interactionMode,
      measurementCount,
      orthographic,
      sectionState,
      selectionActive,
      showAxes,
      showAxisLabels,
    ]
  );

  const fitModelToView = useCallback(
    (frame: ModelFrame, enableTransition: boolean) => {
      const cameraControls = cameraControlsRef.current;

      if (!cameraControls) {
        return;
      }

      fitCountRef.current += 1;
      pendingAutoFitVersionRef.current = null;
      hasFramedOnceRef.current = true;

      void fitCameraToModel({
        cameraControls,
        frame,
        orthographic,
        sceneStyle,
        enableTransition,
      }).then(() => {
        publishTestState();
      });
    },
    [cameraControlsRef, orthographic, publishTestState, sceneStyle]
  );

  useEffect(() => {
    const cameraControls = cameraControlsRef.current;

    if (!cameraControls) {
      return;
    }

    const handleControlStart = () => {
      isUserControllingRef.current = true;
    };

    const handleRest = () => {
      isUserControllingRef.current = false;

      const pendingVersion = pendingAutoFitVersionRef.current;
      const pendingFrame = latestModelFrameRef.current;

      if (!pendingVersion || !pendingFrame || pendingFrame.version !== pendingVersion) {
        publishTestState();
        return;
      }

      fitModelToView(pendingFrame, true);
    };

    const handleWheel = () => {
      isUserControllingRef.current = true;
    };

    cameraControls.addEventListener('controlstart', handleControlStart);
    cameraControls.addEventListener('rest', handleRest);
    gl.domElement.addEventListener('wheel', handleWheel, { passive: true });

    return () => {
      cameraControls.removeEventListener('controlstart', handleControlStart);
      cameraControls.removeEventListener('rest', handleRest);
      gl.domElement.removeEventListener('wheel', handleWheel);
    };
  }, [cameraControlsRef, fitModelToView, gl.domElement, publishTestState]);

  useEffect(() => {
    publishTestState(modelFrame);

    return () => {
      if (isDevRuntime) {
        delete window.__TEST_PREVIEW__;
      }
    };
  }, [isDevRuntime, modelFrame, publishTestState]);

  useEffect(() => {
    if (!modelFrame) {
      currentFitsRef.current = true;
      publishTestState(null);
      return;
    }

    const cameraControls = cameraControlsRef.current;

    if (!cameraControls) {
      return;
    }

    // If the camera type hasn't caught up to the orthographic setting yet, wait for the next
    // render. drei creates a new CameraControlsImpl when the R3F camera changes, which happens
    // one render after the orthographic state change. Acting on the mismatched state would call
    // fitToBox/setLookAt on the wrong camera type and leave the new camera unfitted.
    const cameraMatchesProjection = orthographic
      ? camera instanceof THREE.OrthographicCamera
      : camera instanceof THREE.PerspectiveCamera;

    if (!cameraMatchesProjection) {
      return;
    }

    const framing = derivePreviewFramingMetrics(modelFrame.box, sceneStyle);

    if (camera instanceof THREE.PerspectiveCamera) {
      camera.near = sceneStyle.camera.near;
      cameraControls.minDistance = framing.minDistance;
      cameraControls.maxDistance = framing.maxDistance;
    } else if (camera instanceof THREE.OrthographicCamera) {
      camera.near = sceneStyle.camera.orthographicNear;
    }

    if (camera instanceof THREE.PerspectiveCamera || camera instanceof THREE.OrthographicCamera) {
      camera.far = framing.cameraFar;
      camera.updateProjectionMatrix();
    }

    const isFirstFrame = !hasFramedOnceRef.current;
    const projectionChanged = lastProjectionRef.current !== orthographic;
    const modelVersionChanged = lastModelVersionRef.current !== modelFrame.version;
    const previousMaxDim = lastModelMaxDimRef.current;
    const shrankSignificantly =
      previousMaxDim !== null && modelFrame.maxDim < previousMaxDim * SIGNIFICANT_SHRINK_RATIO;
    const changedSlightly =
      previousMaxDim !== null &&
      modelFrame.maxDim >= previousMaxDim * SIGNIFICANT_SHRINK_RATIO &&
      modelFrame.maxDim <= previousMaxDim * 1.1;

    currentFitsRef.current = boxFitsCameraView(camera, modelFrame.box);
    const remainsVisibleInView = boxFitsCameraView(camera, modelFrame.box, -0.25);
    // Once a user has panned to a custom framing, small model edits should keep that composition
    // instead of snapping the camera back to center.
    const preserveExistingFraming =
      modelVersionChanged && !isFirstFrame && !projectionChanged && changedSlightly;
    const forceRefitForShrink = modelVersionChanged && shrankSignificantly;

    const needsFit =
      isFirstFrame ||
      projectionChanged ||
      (modelVersionChanged &&
        !preserveExistingFraming &&
        (!remainsVisibleInView ||
          shrankSignificantly ||
          boxUnderfillsCameraView(camera, modelFrame.box)));

    lastProjectionRef.current = orthographic;
    lastModelVersionRef.current = modelFrame.version;
    lastModelMaxDimRef.current = modelFrame.maxDim;

    if (forceRefitForShrink) {
      pendingAutoFitVersionRef.current = null;
      fitModelToView(modelFrame, true);
      return;
    }

    if (!needsFit) {
      pendingAutoFitVersionRef.current = null;
      publishTestState(modelFrame);
      return;
    }

    if (isUserControllingRef.current && !isFirstFrame && !projectionChanged) {
      pendingAutoFitVersionRef.current = modelFrame.version;
      publishTestState(modelFrame);
      return;
    }

    fitModelToView(modelFrame, isFirstFrame ? animateInitialFrame : true);
  }, [
    animateInitialFrame,
    camera,
    cameraControlsRef,
    fitModelToView,
    modelFrame,
    orthographic,
    publishTestState,
    sceneStyle,
  ]);

  return null;
}

class EnvironmentErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  render() {
    return this.state.hasError ? null : this.props.children;
  }
}

function EnvironmentWithFallback({ preset }: { preset: string }) {
  return (
    <EnvironmentErrorBoundary>
      <Environment preset={preset as Parameters<typeof Environment>[0]['preset']} />
    </EnvironmentErrorBoundary>
  );
}

export function ThreeViewer({
  preview3dPath,
  isLoading,
  viewerId,
  onVisualReady,
  hasCurrentModelApiKey,
  canAttachToAi,
  onAttachToAi,
}: ThreeViewerProps) {
  const { theme } = useTheme();
  const [settings] = useSettings();
  const { isMobile } = useMobileLayout();
  const sceneStyle = useMemo(() => getPreviewSceneStyle(theme), [theme]);
  const animateInitialFrameRef = useRef(viewerId ? !introAnimatedViewerIds.has(viewerId) : true);
  const materialManagerRef = useRef(new ViewerMaterialManager());
  const rootRef = useRef<HTMLDivElement>(null);
  const previewSurfaceRef = useRef<HTMLDivElement>(null);
  const cameraControlsRef = useRef<CameraControlsType>(null);
  const annotationStageRef = useRef<Konva.Stage | null>(null);

  const [modelFrame, setModelFrame] = useState<ModelFrame | null>(null);
  const [loadedModel, setLoadedModel] = useState<LoadedPreviewModel | null>(null);
  const lastVisualReadyVersionRef = useRef<string | null>(null);
  const lastLoadedGeometryVersionRef = useRef<string | null>(null);
  const [orthographic, setOrthographic] = useState(false);
  const [wireframe, setWireframe] = useState(false);
  const [previewSurfaceSize, setPreviewSurfaceSize] = useState({ width: 0, height: 0 });
  const [interactionMode, setInteractionMode] = useState<InteractionMode>('orbit');
  const [selection, setSelection] = useState<SelectionState>(EMPTY_SELECTION);
  const [hoverSelection, setHoverSelection] = useState<SelectionState>(EMPTY_SELECTION);
  const [draftMeasurement, setDraftMeasurement] = useState<MeasurementDraft3D>(INITIAL_DRAFT);
  const [measurements, setMeasurements] = useState<MeasurementRecord3D[]>([]);
  const [selectedMeasurementId, setSelectedMeasurementId] = useState<string | null>(null);
  const [sectionState, setSectionState] = useState<SectionPlaneState | null>(null);
  const [shiftPanActive, setShiftPanActive] = useState(false);
  const [liveMessage, setLiveMessage] = useState('');
  const [isAttachingAnnotation, setIsAttachingAnnotation] = useState(false);
  const annotationSession = useViewerAnnotationSession();
  const resetAnnotationSession = annotationSession.resetSession;
  const analytics = useAnalytics();

  const gridMetrics = useMemo(() => derivePreviewGridMetrics(modelFrame), [modelFrame]);
  const axisMetrics = useMemo(
    () => derivePreviewAxisMetrics(modelFrame, gridMetrics),
    [gridMetrics, modelFrame]
  );
  const interactionConfig = useMemo(
    () => createViewerInteractionConfig(shiftPanActive, orthographic),
    [orthographic, shiftPanActive]
  );
  const prefersTouchHint = useMemo(
    () => typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0,
    []
  );
  const showControlsHint = !settings.ui.hasDismissedViewerControlsHint;
  const showAxes = settings.viewer.showAxes;
  const showAxisLabels = settings.viewer.showAxisLabels;
  const showGrid = settings.viewer.show3DGrid;
  const showShadows = settings.viewer.showShadows;
  const showModelColors = settings.viewer.showModelColors;
  const showViewcube = settings.viewer.showViewcube;
  const snapEnabled = settings.viewer.measurementSnapEnabled;
  const showSelectionInfo = settings.viewer.showSelectionInfo;

  const sectionPlane = useMemo(
    () =>
      loadedModel && sectionState?.enabled
        ? createClippingPlane(loadedModel.bounds, sectionState)
        : null,
    [loadedModel, sectionState]
  );
  const cameraControlsEnabled = interactionMode !== 'annotate';

  const activeBounds = selection.bounds ?? loadedModel?.bounds ?? null;

  useEffect(() => {
    const element = previewSurfaceRef.current;
    if (!element) {
      return;
    }

    const updateSize = () => {
      const rect = element.getBoundingClientRect();
      setPreviewSurfaceSize({ width: rect.width, height: rect.height });
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
    if (!viewerId) {
      return;
    }

    introAnimatedViewerIds.add(viewerId);
  }, [viewerId]);

  useEffect(() => {
    if (!loadedModel) {
      lastLoadedGeometryVersionRef.current = null;
      setSelection(EMPTY_SELECTION);
      setHoverSelection(EMPTY_SELECTION);
      setMeasurements([]);
      setSelectedMeasurementId(null);
      setDraftMeasurement(INITIAL_DRAFT);
      setSectionState(null);
      resetAnnotationSession();
      setIsAttachingAnnotation(false);
      return;
    }

    if (lastLoadedGeometryVersionRef.current === loadedModel.version) {
      return;
    }
    lastLoadedGeometryVersionRef.current = loadedModel.version;

    setSelection(EMPTY_SELECTION);
    setHoverSelection(EMPTY_SELECTION);
    setMeasurements([]);
    setSelectedMeasurementId(null);
    setDraftMeasurement((current) => ({
      ...INITIAL_DRAFT,
      status: current.status === 'idle' ? 'idle' : 'placing-start',
    }));
    setSectionState(createDefaultSectionPlaneState(loadedModel.bounds));
    resetAnnotationSession();
    setIsAttachingAnnotation(false);
  }, [loadedModel, resetAnnotationSession]);

  useEffect(() => {
    if (interactionMode !== 'annotate') {
      return;
    }

    setSelection(EMPTY_SELECTION);
    setHoverSelection(EMPTY_SELECTION);
  }, [interactionMode]);

  useEffect(() => {
    if (!sectionState || !loadedModel) {
      return;
    }

    if (interactionMode !== 'section-plane' && sectionState.enabled) {
      setSectionState({ ...sectionState, enabled: false });
      return;
    }

    if (interactionMode === 'section-plane' && !sectionState.enabled) {
      setSectionState({ ...sectionState, enabled: true });
    }
  }, [interactionMode, loadedModel, sectionState]);

  useEffect(() => {
    const manager = materialManagerRef.current;
    const root = loadedModel?.root ?? null;

    manager.apply(root, {
      clippingPlane: sectionPlane,
      selected: !!selection.objectUuid,
    });

    return () => {
      manager.restore(root);
    };
  }, [loadedModel?.root, sectionPlane, selection.objectUuid]);

  const fitCurrentModelToView = () => {
    const cameraControls = cameraControlsRef.current;

    if (!cameraControls || !modelFrame) {
      return;
    }

    void fitCameraToModel({
      cameraControls,
      frame: modelFrame,
      orthographic,
      sceneStyle,
      enableTransition: true,
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

  const { handleModeChange, trackMeasurementsCleared, trackDistanceMeasurementCommitted } =
    useThreeViewerAnalytics({
      interactionMode,
      setInteractionMode,
      setDraftMeasurement,
      initialDraft: INITIAL_DRAFT,
      activeBounds,
      loadedModel,
      selection,
      sectionState,
      measurementUnit: settings.viewer.measurementUnit,
      snapEnabled,
    });

  const clearAllMeasurements = useCallback(() => {
    trackMeasurementsCleared(measurements.length);
    setMeasurements([]);
    setSelectedMeasurementId(null);
    setLiveMessage('Measurements cleared');
  }, [measurements.length, trackMeasurementsCleared]);

  const handleSectionReset = useCallback(() => {
    if (loadedModel) {
      setSectionState(createDefaultSectionPlaneState(loadedModel.bounds));
    }
  }, [loadedModel]);

  const exitAnnotationMode = useCallback(() => {
    resetAnnotationSession();
    setInteractionMode('orbit');
  }, [resetAnnotationSession]);

  const handleAnnotationCommit = useCallback(() => {
    const shape = annotationSession.completeDraft();
    if (shape) {
      analytics.track('annotation committed', { viewer_kind: '3d', shape_type: shape.kind });
    }
  }, [analytics, annotationSession]);

  const handleAnnotationClear = useCallback(() => {
    const count = annotationSession.shapes.length + (annotationSession.draft ? 1 : 0);
    annotationSession.clearAll();
    if (count > 0) {
      analytics.track('annotations cleared', { viewer_kind: '3d', cleared_count: count });
    }
  }, [analytics, annotationSession]);

  const handleAnnotationAttach = useCallback(async () => {
    if (!previewSurfaceRef.current || !annotationStageRef.current) {
      notifyError({
        operation: 'viewer-annotation-export',
        fallbackMessage: 'No preview is available to annotate.',
        toastId: 'viewer-annotation-export-error',
      });
      return;
    }

    const modelCanvas = previewSurfaceRef.current.querySelector(
      'canvas[data-engine]'
    ) as HTMLCanvasElement | null;
    if (!modelCanvas) {
      notifyError({
        operation: 'viewer-annotation-export',
        fallbackMessage: 'No preview is available to annotate.',
        toastId: 'viewer-annotation-export-error',
      });
      return;
    }

    setIsAttachingAnnotation(true);
    try {
      const baseImageDataUrl = modelCanvas.toDataURL('image/png');
      const rect = previewSurfaceRef.current.getBoundingClientRect();
      const overlay = await exportAnnotationOverlayDataUrl({
        stage: annotationStageRef.current,
        surface: { width: rect.width, height: rect.height },
        pixelRatio: typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1,
      });

      const composedDataUrl = await composeAnnotatedImage({
        baseImageDataUrl,
        overlayImageDataUrl: overlay.dataUrl,
        width: overlay.width,
        height: overlay.height,
        backgroundColor: sceneStyle.backgroundColor,
      });
      const attachmentFile = await createAnnotationAttachmentFile(
        composedDataUrl,
        'viewer-annotation-3d.png'
      );
      const shapeCount = annotationSession.shapes.length;
      const result = await onAttachToAi(attachmentFile);

      if (result.status === 'attached') {
        analytics.track('annotation attached', {
          viewer_kind: '3d',
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
          viewer_kind: '3d',
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
          viewer_kind: '3d',
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
        viewer_kind: '3d',
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
  }, [
    analytics,
    annotationSession.shapes.length,
    exitAnnotationMode,
    onAttachToAi,
    sceneStyle.backgroundColor,
  ]);

  const handleMeasurementDelete = useCallback(
    (id: string) => {
      setMeasurements((existing) => existing.filter((m) => m.id !== id));
      setSelectedMeasurementId((current) => (current === id ? null : current));
      setLiveMessage('Measurement deleted');
    },
    [setLiveMessage]
  );

  const handleSelectionChange = useCallback(
    (next: SelectionState) => {
      setSelection(next);
      if (next.objectUuid) {
        setLiveMessage('Selection updated');
      }
    },
    [setLiveMessage]
  );

  const handleCommitMeasurement = useCallback(
    (measurement: MeasurementRecord3D) => {
      setMeasurements((existing) => [measurement, ...existing]);
      setSelectedMeasurementId(measurement.id);
      setLiveMessage('Measurement added');
      trackDistanceMeasurementCommitted(measurements.length + 1);
    },
    [measurements.length, trackDistanceMeasurementCommitted, setLiveMessage]
  );

  const updateSectionAxis = (axis: SectionAxis) => {
    if (!loadedModel || !sectionState) {
      return;
    }

    const bounds = getSectionAxisBounds(loadedModel.bounds, axis);
    setSectionState({
      enabled: true,
      axis,
      inverted: false,
      offset: (bounds.min + bounds.max) / 2,
    });
  };

  const contextPanelProps = useMemo<ToolContextPanelProps>(
    () => ({
      loadedModel,
      measurements,
      selectedMeasurementId,
      sectionState,
      draftMeasurement,
      selection,
      onSectionStateChange: setSectionState,
      onSectionReset: handleSectionReset,
      onMeasurementSelect: setSelectedMeasurementId,
      onMeasurementDelete: handleMeasurementDelete,
      onMeasurementsClear: clearAllMeasurements,
    }),
    [
      loadedModel,
      measurements,
      selectedMeasurementId,
      sectionState,
      draftMeasurement,
      selection,
      handleSectionReset,
      handleMeasurementDelete,
      clearAllMeasurements,
    ]
  );

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Shift') {
      setShiftPanActive(true);
    }

    switch (event.key) {
      case 'm':
      case 'M':
        event.preventDefault();
        handleModeChange('measure-distance', 'shortcut');
        break;
      case 'b':
      case 'B':
        event.preventDefault();
        handleModeChange('measure-bbox', 'shortcut');
        break;
      case 's':
      case 'S':
        event.preventDefault();
        handleModeChange('section-plane', 'shortcut');
        break;
      case 'a':
      case 'A':
        event.preventDefault();
        handleModeChange('annotate', 'shortcut');
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
        if (interactionMode === 'annotate') {
          exitAnnotationMode();
        } else if (
          interactionMode === 'measure-distance' &&
          draftMeasurement.status === 'placing-end'
        ) {
          setDraftMeasurement({ ...INITIAL_DRAFT, status: 'placing-start' });
        } else {
          handleModeChange('orbit', 'shortcut');
        }
        break;
      case 'ArrowLeft':
      case 'ArrowDown':
        if (interactionMode === 'section-plane' && sectionState && loadedModel) {
          event.preventDefault();
          setSectionState({
            ...sectionState,
            offset: clampSectionOffset(
              loadedModel.bounds,
              sectionState.axis,
              sectionState.offset - loadedModel.diagonal * 0.02
            ),
          });
        }
        break;
      case 'ArrowRight':
      case 'ArrowUp':
        if (interactionMode === 'section-plane' && sectionState && loadedModel) {
          event.preventDefault();
          setSectionState({
            ...sectionState,
            offset: clampSectionOffset(
              loadedModel.bounds,
              sectionState.axis,
              sectionState.offset + loadedModel.diagonal * 0.02
            ),
          });
        }
        break;
      case 'x':
      case 'X':
        if (interactionMode === 'section-plane') {
          event.preventDefault();
          updateSectionAxis('x');
        }
        break;
      case 'y':
      case 'Y':
        if (interactionMode === 'section-plane') {
          event.preventDefault();
          updateSectionAxis('y');
        }
        break;
      case 'z':
      case 'Z':
        if (interactionMode === 'section-plane') {
          event.preventDefault();
          updateSectionAxis('z');
        }
        break;
      case 'r':
      case 'R':
        if (interactionMode === 'section-plane' && loadedModel) {
          event.preventDefault();
          setSectionState(createDefaultSectionPlaneState(loadedModel.bounds));
          setInteractionMode('section-plane');
        }
        break;
      default:
        break;
    }
  };

  const handleKeyUp = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Shift') {
      setShiftPanActive(false);
      if (
        interactionMode === 'measure-distance' &&
        draftMeasurement.status === 'placing-end' &&
        draftMeasurement.start &&
        draftMeasurement.current
      ) {
        setDraftMeasurement((current) => ({ ...current, axisLock: null }));
      }
    }
  };

  const dismissControlsHint = () => {
    updateSetting('ui', { hasDismissedViewerControlsHint: true });
  };

  useEffect(() => {
    if (loadedModel?.version !== preview3dPath) {
      return;
    }

    if (!loadedModel || lastVisualReadyVersionRef.current === loadedModel.version) {
      return;
    }

    lastVisualReadyVersionRef.current = loadedModel.version;
    onVisualReady?.();
  }, [loadedModel, onVisualReady, preview3dPath]);

  const selectionSource = selection.objectUuid ? selection : hoverSelection;

  return (
    <div
      ref={rootRef}
      className="flex flex-col w-full h-full outline-none"
      style={{ backgroundColor: sceneStyle.backgroundColor }}
      onContextMenu={(event) => event.preventDefault()}
      onPointerDownCapture={() => rootRef.current?.focus()}
      onKeyDown={handleKeyDown}
      onKeyUp={handleKeyUp}
      onBlur={() => setShiftPanActive(false)}
      tabIndex={0}
      data-testid="preview-3d-root"
    >
      {isLoading && (
        <div
          className="absolute inset-0 flex items-center justify-center z-50"
          style={{
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            backdropFilter: 'blur(4px)',
          }}
        >
          <div style={{ color: 'var(--text-secondary)' }}>
            <div
              className="animate-spin h-8 w-8 border-4 rounded-full mx-auto mb-2"
              style={{
                borderColor: 'var(--border-primary)',
                borderTopColor: 'var(--accent-primary)',
              }}
            />
            <Text variant="body">Rendering...</Text>
          </div>
        </div>
      )}

      <div className="flex flex-row flex-1 min-h-0">
        {!isMobile && (
          <ViewerToolPalette
            mode={interactionMode}
            onModeChange={(mode) => handleModeChange(mode, 'toolbar')}
            loadedModel={loadedModel}
          />
        )}
        <div
          ref={previewSurfaceRef}
          className="relative flex-1 min-w-0"
          data-preview-root={viewerId ?? 'default-preview'}
        >
          <div
            className="absolute top-2 right-2 z-10 flex gap-2"
            onClick={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
          >
            <IconButton
              variant="toolbar"
              onClick={fitCurrentModelToView}
              title="Fit to View"
              tooltipSide="bottom"
              data-testid="preview-fit-view"
              disabled={interactionMode === 'annotate'}
            >
              <TbFocus2 size={18} />
            </IconButton>

            <IconButton
              variant="toolbar"
              onClick={() => setOrthographic(!orthographic)}
              isActive={orthographic}
              title="Orthographic Projection"
              tooltipSide="bottom"
              data-testid="preview-toggle-orthographic"
            >
              <TbBox size={18} />
            </IconButton>

            <IconButton
              variant="toolbar"
              onClick={() => setWireframe(!wireframe)}
              isActive={wireframe}
              title="Wireframe Mode"
              tooltipSide="bottom"
            >
              {wireframe ? <TbBox size={18} /> : <TbBoxModel size={18} />}
            </IconButton>

            <IconButton
              variant="toolbar"
              onClick={() => updateSetting('viewer', { showShadows: !showShadows })}
              isActive={showShadows}
              title="Toggle Shadows"
              tooltipSide="bottom"
            >
              <TbSun size={18} />
            </IconButton>

            {isMobile ? (
              <IconButton
                variant="toolbar"
                onClick={() => handleModeChange('annotate', 'toolbar')}
                isActive={interactionMode === 'annotate'}
                title="Annotate Preview"
                tooltipSide="bottom"
                data-testid="preview-toggle-annotate"
              >
                <TbBrush size={18} />
              </IconButton>
            ) : null}
          </div>

          <div aria-live="polite" className="sr-only">
            {liveMessage}
          </div>

          {showSelectionInfo && interactionMode === 'orbit' && selectionSource.point ? (
            <div
              className="absolute right-3 bottom-3 z-20 w-72 rounded-lg p-3 space-y-2"
              style={{
                backgroundColor: 'var(--bg-elevated)',
                border: '1px solid var(--border-primary)',
                color: 'var(--text-secondary)',
              }}
              data-testid="preview-3d-inspector-hud"
            >
              <div className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>
                Inspector
              </div>
              <div className="text-[11px]">
                <div>
                  <span style={{ color: 'var(--text-tertiary)' }}>Point:</span>{' '}
                  {formatVector3(
                    selectionSource.point ? threeToOpenScadDelta(selectionSource.point) : null
                  )}
                </div>
                <div>
                  <span style={{ color: 'var(--text-tertiary)' }}>Normal:</span>{' '}
                  {formatVector3(
                    selectionSource.normal ? threeToOpenScadDelta(selectionSource.normal) : null
                  )}
                </div>
              </div>
            </div>
          ) : null}

          {showControlsHint && (
            <div
              className="absolute bottom-3 right-3 z-30 rounded text-xs pr-8"
              style={{
                backgroundColor: 'rgba(0, 0, 0, 0.32)',
                border: '1px solid var(--border-secondary)',
                color: 'var(--text-primary)',
                backdropFilter: 'blur(8px)',
                maxWidth: '360px',
                padding: '10px 38px 10px 12px',
              }}
              data-testid="preview-controls-hint"
            >
              {/* eslint-disable-next-line no-restricted-syntax -- absolute 20×20px dismiss X on a floating hint badge; this sub-sm size doesn't fit any IconButton variant without className size fights */}
              <button
                type="button"
                onClick={dismissControlsHint}
                className="absolute top-2 right-2 rounded-lg transition-colors flex items-center justify-center"
                style={{
                  width: '20px',
                  height: '20px',
                  color: 'var(--text-secondary)',
                }}
                title="Dismiss controls hint"
                aria-label="Dismiss controls hint"
                data-testid="preview-controls-hint-dismiss"
              >
                <TbX size={14} />
              </button>
              {prefersTouchHint
                ? `${interactionConfig.touchHint} Use M, B, S, and A when the viewer is focused to switch inspection tools.`
                : `${interactionConfig.desktopHint} Use M, B, S, and A when the viewer is focused to switch inspection tools.`}
            </div>
          )}

          <Canvas
            shadows
            gl={{ preserveDrawingBuffer: true }}
            onCreated={({ gl }) => {
              gl.localClippingEnabled = true;
            }}
            style={{ width: '100%', height: '100%', background: sceneStyle.backgroundColor }}
          >
            {orthographic ? (
              <OrthographicCamera
                makeDefault
                position={sceneStyle.camera.defaultPosition}
                zoom={sceneStyle.camera.orthographicZoom}
                near={sceneStyle.camera.orthographicNear}
                far={sceneStyle.camera.baseFar}
              />
            ) : (
              <PerspectiveCamera
                makeDefault
                position={sceneStyle.camera.defaultPosition}
                fov={sceneStyle.camera.perspectiveFov}
                near={sceneStyle.camera.near}
                far={sceneStyle.camera.baseFar}
              />
            )}

            <ViewerCameraManager
              cameraControlsRef={cameraControlsRef}
              modelFrame={modelFrame}
              orthographic={orthographic}
              sceneStyle={sceneStyle}
              showAxes={showAxes}
              showAxisLabels={showAxisLabels}
              animateInitialFrame={animateInitialFrameRef.current}
              interactionMode={interactionMode}
              selectionActive={!!selection.objectUuid}
              measurementCount={measurements.length}
              sectionState={sectionState}
            />

            <EnvironmentWithFallback preset={sceneStyle.environmentPreset} />
            <ambientLight
              color={sceneStyle.ambientLight.color}
              intensity={sceneStyle.ambientLight.intensity}
            />
            <directionalLight
              color={sceneStyle.directionalLight.color}
              position={sceneStyle.directionalLight.position}
              intensity={sceneStyle.directionalLight.intensity}
              castShadow
              shadow-mapSize={sceneStyle.directionalLight.shadowMapSize}
            />

            <group name="helpersContainer">
              {showGrid ? (
                <Grid
                  infiniteGrid
                  cellSize={gridMetrics.cellSize}
                  sectionSize={gridMetrics.sectionSize}
                  fadeDistance={gridMetrics.fadeDistance}
                  cellThickness={gridMetrics.cellThickness}
                  sectionThickness={gridMetrics.sectionThickness}
                  cellColor={sceneStyle.gridColor}
                  sectionColor={sceneStyle.gridSectionColor}
                />
              ) : null}

              {showAxes && (
                <PreviewAxesOverlay
                  axisMetrics={axisMetrics}
                  sceneStyle={sceneStyle}
                  showLabels={showAxisLabels}
                />
              )}

              {showShadows && sceneStyle.contactShadows.enabledByDefault && (
                <ContactShadows
                  position={[0, 0, 0]}
                  opacity={sceneStyle.contactShadows.opacity}
                  scale={sceneStyle.contactShadows.scale}
                  blur={sceneStyle.contactShadows.blur}
                  far={sceneStyle.contactShadows.far}
                />
              )}
            </group>

            <Preview3DModel
              url={preview3dPath}
              wireframe={wireframe}
              sceneStyle={sceneStyle}
              useModelColors={showModelColors}
              onModelFrameChange={setModelFrame}
              onModelChange={setLoadedModel}
            />

            {interactionMode !== 'annotate' && selection.bounds ? (
              <SelectionBoundsOverlay bounds={selection.bounds} color="#3b82f6" />
            ) : null}
            {interactionMode === 'measure-bbox' && activeBounds ? (
              <BBoxOverlay bounds={activeBounds} />
            ) : null}
            {measurements.length > 0 || draftMeasurement.status !== 'idle' ? (
              <MeasurementOverlay3D
                measurements={measurements}
                draft={draftMeasurement}
                selectedMeasurementId={selectedMeasurementId}
                model={loadedModel}
                accentColor={theme.colors.accent.primary}
                accentHoverColor={theme.colors.accent.hover}
                unit={settings.viewer.measurementUnit}
              />
            ) : null}
            {interactionMode === 'section-plane' && loadedModel && sectionState?.enabled ? (
              <SectionPlaneOverlay
                bounds={loadedModel.bounds}
                state={sectionState}
                color={sceneStyle.axis.xColor}
              />
            ) : null}

            <ViewerInteractionController
              mode={interactionMode}
              model={loadedModel}
              snapEnabled={snapEnabled}
              draft={draftMeasurement}
              onHoverChange={setHoverSelection}
              onSelectionChange={handleSelectionChange}
              onDraftChange={setDraftMeasurement}
              onCommitMeasurement={handleCommitMeasurement}
            />

            <CameraControls
              ref={cameraControlsRef}
              makeDefault
              enabled={cameraControlsEnabled}
              minDistance={0.05}
              maxDistance={sceneStyle.camera.baseMaxDistance}
              mouseButtons={interactionConfig.mouseButtons}
              touches={interactionConfig.touches}
              dollyToCursor={!orthographic}
              dollySpeed={0.5}
              truckSpeed={1}
            />

            {showViewcube ? (
              <GizmoHelper alignment="bottom-left" margin={[80, 80]}>
                <GizmoViewcube
                  font="16px Inter, sans-serif"
                  opacity={1}
                  faces={['Front', 'Back', 'Top', 'Bottom', 'Left', 'Right']}
                  textColor={sceneStyle.backgroundColor}
                  color={sceneStyle.modelColor}
                />
              </GizmoHelper>
            ) : null}
          </Canvas>

          {interactionMode === 'annotate' &&
          previewSurfaceSize.width > 0 &&
          previewSurfaceSize.height > 0 ? (
            <AnnotationOverlay
              surface={previewSurfaceSize}
              shapes={annotationSession.shapes}
              draft={annotationSession.draft}
              onStageReady={(stage) => {
                annotationStageRef.current = stage;
              }}
              onStart={(point) => {
                annotationSession.beginDraft(normalizeViewerPoint(point, previewSurfaceSize));
              }}
              onMove={(point) => {
                if (!annotationSession.draft) {
                  return;
                }
                annotationSession.updateDraft(normalizeViewerPoint(point, previewSurfaceSize));
              }}
              onEnd={handleAnnotationCommit}
            />
          ) : null}

          {!isMobile &&
            (() => {
              const activeTool = VIEWER_TOOLS.find((t) => t.id === interactionMode);
              const ContextPanel = activeTool?.contextPanel;
              if (!ContextPanel) return null;
              return (
                <ToolPanel key={interactionMode} label={activeTool.label}>
                  <ContextPanel {...contextPanelProps} />
                </ToolPanel>
              );
            })()}

          {interactionMode === 'annotate' ? (
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
        </div>
      </div>
    </div>
  );
}

function PreviewAxesOverlay({
  axisMetrics,
  sceneStyle,
  showLabels,
}: {
  axisMetrics: ReturnType<typeof derivePreviewAxisMetrics>;
  sceneStyle: PreviewSceneStyle;
  showLabels: boolean;
}) {
  const overlay = useMemo(
    () => createPreviewAxesOverlay(axisMetrics, sceneStyle, { showLabels }),
    [axisMetrics, sceneStyle, showLabels]
  );
  const camera = useThree((state) => state.camera);
  const labelVisibilityRef = useRef<string | null>(null);

  useFrame(() => {
    const labelVisibility = getAxisLabelVisibility(camera, showLabels);
    const labelVisibilityKey = JSON.stringify(labelVisibility);
    const setAxisLabelsVisibility = overlay.userData.setAxisLabelsVisibility as
      | ((visibility: PreviewAxisLabelVisibility) => void)
      | undefined;

    if (setAxisLabelsVisibility && labelVisibilityRef.current !== labelVisibilityKey) {
      setAxisLabelsVisibility(labelVisibility);
      labelVisibilityRef.current = labelVisibilityKey;
    }

    const updateLabelScales = overlay.userData.updateLabelScales as
      | ((camera: THREE.Camera) => void)
      | undefined;
    updateLabelScales?.(camera);
  });

  useEffect(() => {
    labelVisibilityRef.current = null;
    return () => {
      disposePreviewAxesOverlay(overlay);
    };
  }, [overlay]);

  return <primitive object={overlay} />;
}

function tupleFromVector(vector: THREE.Vector3): [number, number, number] {
  return [vector.x, vector.y, vector.z];
}

function getAxisLabelVisibility(
  camera: THREE.Camera,
  showLabels: boolean
): PreviewAxisLabelVisibility {
  if (!showLabels) {
    return { x: false, y: false, z: false, origin: false };
  }

  const viewDirection = camera.getWorldDirection(new THREE.Vector3());
  const axisAlignmentThreshold = 0.96;
  const alignments = {
    x: Math.abs(viewDirection.x),
    y: Math.abs(viewDirection.z),
    z: Math.abs(viewDirection.y),
  } satisfies Record<'x' | 'y' | 'z', number>;

  let hiddenAxis: keyof typeof alignments | null = null;
  let strongestAlignment = 0;

  for (const axis of Object.keys(alignments) as Array<keyof typeof alignments>) {
    if (alignments[axis] > strongestAlignment) {
      strongestAlignment = alignments[axis];
      hiddenAxis = axis;
    }
  }

  if (!hiddenAxis || strongestAlignment < axisAlignmentThreshold) {
    return { x: true, y: true, z: true, origin: true };
  }

  return {
    x: hiddenAxis !== 'x',
    y: hiddenAxis !== 'y',
    z: hiddenAxis !== 'z',
    origin: true,
  };
}

function fitCameraToModel({
  cameraControls,
  frame,
  orthographic,
  sceneStyle,
  enableTransition,
}: {
  cameraControls: CameraControlsType;
  frame: ModelFrame;
  orthographic: boolean;
  sceneStyle: PreviewSceneStyle;
  enableTransition: boolean;
}) {
  if (!orthographic) {
    const expandedFitBox = getExpandedFitBox(frame.box, sceneStyle);
    const fitSphere = expandedFitBox.getBoundingSphere(new THREE.Sphere());
    const currentPosition = cameraControls.getPosition(new THREE.Vector3(), true);
    const currentTarget = cameraControls.getTarget(new THREE.Vector3(), true);
    const viewDirection = currentPosition.clone().sub(currentTarget);

    if (viewDirection.lengthSq() === 0) {
      viewDirection.set(...sceneStyle.camera.defaultPosition);
    }

    viewDirection.normalize();

    const nextDistance = cameraControls.getDistanceToFitSphere(fitSphere.radius);
    const nextPosition = fitSphere.center.clone().addScaledVector(viewDirection, nextDistance);

    return cameraControls.setLookAt(
      nextPosition.x,
      nextPosition.y,
      nextPosition.z,
      fitSphere.center.x,
      fitSphere.center.y,
      fitSphere.center.z,
      enableTransition
    );
  }

  return cameraControls.fitToBox(
    frame.box,
    enableTransition,
    getFitPaddingOptions(frame.box, sceneStyle)
  );
}
