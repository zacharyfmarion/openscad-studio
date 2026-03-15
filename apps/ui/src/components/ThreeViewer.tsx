import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import {
  CameraControls,
  Grid,
  GizmoHelper,
  GizmoViewcube,
  OrthographicCamera,
  PerspectiveCamera,
  ContactShadows,
  Environment,
  Wireframe as DreiWireframe,
} from '@react-three/drei';
import type { CameraControls as CameraControlsType } from '@react-three/drei';
import { STLLoader } from 'three-stdlib';
import * as THREE from 'three';
import { useTheme } from '../contexts/ThemeContext';
import { updateSetting, useSettings } from '../stores/settingsStore';
import { createViewerInteractionConfig } from './viewerInteractionConfig';
import {
  boxFitsCameraView,
  boxUnderfillsCameraView,
  buildModelFrame,
  derivePreviewAxisMetrics,
  derivePreviewFramingMetrics,
  derivePreviewGridMetrics,
  getExpandedFitBox,
  getFitPaddingOptions,
  SIGNIFICANT_SHRINK_RATIO,
  type ModelFrame,
} from '../services/previewFraming';
import { getPreviewSceneStyle, type PreviewSceneStyle } from '../services/previewSceneConfig';
import {
  createPreviewAxesOverlay,
  disposePreviewAxesOverlay,
  type PreviewAxisLabelVisibility,
} from '../services/previewAxes';
import { TbBox, TbBoxModel, TbSun, TbFocus2, TbX } from 'react-icons/tb';

interface ThreeViewerProps {
  stlPath: string;
  isLoading?: boolean;
  viewerId?: string;
}

const introAnimatedViewerIds = new Set<string>();

declare global {
  interface Window {
    __TEST_PREVIEW__?: {
      currentFits: boolean;
      fitCount: number;
      maxDim: number | null;
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
    };
  }
}

function STLModel({
  url,
  wireframe,
  sceneStyle,
  onModelFrameChange,
}: {
  url: string;
  wireframe: boolean;
  sceneStyle: PreviewSceneStyle;
  onModelFrameChange: (frame: ModelFrame | null) => void;
}) {
  const [geometry, setGeometry] = useState<THREE.BufferGeometry | null>(null);

  useEffect(() => {
    const loader = new STLLoader();
    let cancelled = false;

    loader.load(
      url,
      (loadedGeometry) => {
        loadedGeometry.computeVertexNormals();

        if (cancelled) {
          loadedGeometry.dispose();
          return;
        }

        const modelFrame = buildModelFrame(loadedGeometry, url);
        onModelFrameChange(modelFrame);
        setGeometry((previousGeometry) => {
          previousGeometry?.dispose();
          return loadedGeometry;
        });
      },
      undefined,
      (error) => {
        if (!cancelled) {
          onModelFrameChange(null);
          console.error('Error loading STL:', error);
        }
      }
    );

    return () => {
      cancelled = true;
    };
  }, [onModelFrameChange, url]);

  useEffect(() => {
    return () => {
      geometry?.dispose();
    };
  }, [geometry]);

  if (!geometry) {
    return null;
  }

  return (
    <mesh geometry={geometry} castShadow receiveShadow rotation={[-Math.PI / 2, 0, 0]}>
      {wireframe ? (
        <>
          <meshBasicMaterial
            color={sceneStyle.modelColor}
            transparent
            opacity={0.2}
            side={THREE.DoubleSide}
          />
          <DreiWireframe
            geometry={geometry}
            stroke={sceneStyle.modelColor}
            thickness={0.05}
            fillOpacity={0}
            strokeOpacity={0.9}
          />
        </>
      ) : (
        <meshStandardMaterial
          color={sceneStyle.modelColor}
          metalness={sceneStyle.material.metalness}
          roughness={sceneStyle.material.roughness}
          envMapIntensity={sceneStyle.material.envMapIntensity}
        />
      )}
    </mesh>
  );
}

function ViewerCameraManager({
  cameraControlsRef,
  modelFrame,
  orthographic,
  sceneStyle,
  showAxes,
  showAxisLabels,
  animateInitialFrame,
}: {
  cameraControlsRef: React.RefObject<CameraControlsType | null>;
  modelFrame: ModelFrame | null;
  orthographic: boolean;
  sceneStyle: PreviewSceneStyle;
  showAxes: boolean;
  showAxisLabels: boolean;
  animateInitialFrame: boolean;
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

  latestModelFrameRef.current = modelFrame;

  const publishTestState = useCallback(
    (frame = latestModelFrameRef.current) => {
      if (!import.meta.env.DEV) {
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
      };
    },
    [camera, cameraControlsRef, orthographic, showAxes, showAxisLabels]
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
        publishTestState(frame);
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
      if (import.meta.env.DEV) {
        delete window.__TEST_PREVIEW__;
      }
    };
  }, [modelFrame, publishTestState]);

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

    currentFitsRef.current = boxFitsCameraView(camera, modelFrame.box);
    const underfillsView = boxUnderfillsCameraView(camera, modelFrame.box);

    const needsFit =
      isFirstFrame ||
      projectionChanged ||
      (modelVersionChanged && (!currentFitsRef.current || (shrankSignificantly && underfillsView)));

    lastProjectionRef.current = orthographic;
    lastModelVersionRef.current = modelFrame.version;
    lastModelMaxDimRef.current = modelFrame.maxDim;

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

export function ThreeViewer({ stlPath, isLoading, viewerId }: ThreeViewerProps) {
  const { theme } = useTheme();
  const [settings] = useSettings();
  const sceneStyle = useMemo(() => getPreviewSceneStyle(theme), [theme]);
  const animateInitialFrameRef = useRef(
    viewerId ? !introAnimatedViewerIds.has(viewerId) : true
  );

  const [modelFrame, setModelFrame] = useState<ModelFrame | null>(null);
  const [shiftPanActive, setShiftPanActive] = useState(false);
  const [orthographic, setOrthographic] = useState(false);
  const [wireframe, setWireframe] = useState(false);
  const [showShadows, setShowShadows] = useState(true);
  const cameraControlsRef = useRef<CameraControlsType>(null);
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

  useEffect(() => {
    if (!viewerId) {
      return;
    }

    introAnimatedViewerIds.add(viewerId);
  }, [viewerId]);

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

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Shift') {
        setShiftPanActive(true);
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.key === 'Shift') {
        setShiftPanActive(false);
      }
    };

    const handleBlur = () => {
      setShiftPanActive(false);
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleBlur);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlur);
    };
  }, []);

  const dismissControlsHint = () => {
    updateSetting('ui', { hasDismissedViewerControlsHint: true });
  };

  return (
    <div
      className="w-full h-full relative"
      style={{ backgroundColor: sceneStyle.backgroundColor }}
      onContextMenu={(event) => event.preventDefault()}
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
            <p>Rendering...</p>
          </div>
        </div>
      )}

      <div className="absolute top-2 right-2 z-10 flex gap-2">
        <button
          onClick={fitCurrentModelToView}
          className="p-2 rounded transition-colors flex items-center justify-center"
          style={{
            backgroundColor: 'var(--bg-elevated)',
            border: '1px solid var(--border-secondary)',
            color: 'var(--text-secondary)',
          }}
          title="Fit to View"
          data-testid="preview-fit-view"
        >
          <TbFocus2 size={18} />
        </button>

        <button
          onClick={() => setOrthographic(!orthographic)}
          className="p-2 rounded transition-colors flex items-center justify-center"
          style={{
            backgroundColor: orthographic ? 'var(--bg-tertiary)' : 'var(--bg-elevated)',
            border: '1px solid var(--border-secondary)',
            color: orthographic ? 'var(--text-inverse)' : 'var(--text-secondary)',
          }}
          title="Orthographic Projection"
          data-testid="preview-toggle-orthographic"
        >
          <TbBox size={18} />
        </button>

        <button
          onClick={() => setWireframe(!wireframe)}
          className="p-2 rounded transition-colors flex items-center justify-center"
          style={{
            backgroundColor: wireframe ? 'var(--bg-tertiary)' : 'var(--bg-elevated)',
            border: '1px solid var(--border-secondary)',
            color: wireframe ? 'var(--text-inverse)' : 'var(--text-secondary)',
          }}
          title="Wireframe Mode"
        >
          {wireframe ? <TbBox size={18} /> : <TbBoxModel size={18} />}
        </button>

        <button
          onClick={() => setShowShadows(!showShadows)}
          className="p-2 rounded transition-colors flex items-center justify-center"
          style={{
            backgroundColor: showShadows ? 'var(--bg-tertiary)' : 'var(--bg-elevated)',
            border: '1px solid var(--border-secondary)',
            color: showShadows ? 'var(--text-inverse)' : 'var(--text-secondary)',
          }}
          title="Toggle Shadows"
        >
          <TbSun size={18} />
        </button>
      </div>

      {showControlsHint && (
        <div
          className="absolute bottom-3 right-3 z-10 rounded text-xs pr-8"
          style={{
            backgroundColor: 'rgba(0, 0, 0, 0.32)',
            border: '1px solid var(--border-secondary)',
            color: 'var(--text-tertiary)',
            backdropFilter: 'blur(8px)',
            maxWidth: '360px',
            padding: '10px 38px 10px 12px',
          }}
          data-testid="preview-controls-hint"
        >
          <button
            type="button"
            onClick={dismissControlsHint}
            className="absolute top-2 right-2 rounded transition-colors flex items-center justify-center"
            style={{
              width: '20px',
              height: '20px',
              color: 'var(--text-tertiary)',
            }}
            title="Dismiss controls hint"
            aria-label="Dismiss controls hint"
            data-testid="preview-controls-hint-dismiss"
          >
            <TbX size={14} />
          </button>
          {prefersTouchHint ? interactionConfig.touchHint : interactionConfig.desktopHint}
        </div>
      )}

      <Canvas
        shadows
        gl={{ preserveDrawingBuffer: true }}
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
        />

        <Environment preset={sceneStyle.environmentPreset} />
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

        <STLModel
          url={stlPath}
          wireframe={wireframe}
          sceneStyle={sceneStyle}
          onModelFrameChange={setModelFrame}
        />

        <CameraControls
          ref={cameraControlsRef}
          makeDefault
          minDistance={0.05}
          maxDistance={sceneStyle.camera.baseMaxDistance}
          mouseButtons={interactionConfig.mouseButtons}
          touches={interactionConfig.touches}
          dollyToCursor={!orthographic}
          dollySpeed={0.5}
          truckSpeed={1}
        />

        <GizmoHelper alignment="bottom-left" margin={[80, 80]}>
          <GizmoViewcube
            font="16px Inter, sans-serif"
            opacity={1}
            faces={['Front', 'Back', 'Top', 'Bottom', 'Left', 'Right']}
            textColor={sceneStyle.backgroundColor}
            color={sceneStyle.modelColor}
          />
        </GizmoHelper>
      </Canvas>
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

    if (!setAxisLabelsVisibility || labelVisibilityRef.current === labelVisibilityKey) {
      return;
    }

    setAxisLabelsVisibility(labelVisibility);
    labelVisibilityRef.current = labelVisibilityKey;
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
