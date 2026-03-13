import { useEffect, useRef, useState, useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
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
import { getPreviewSceneStyle } from '../services/previewSceneConfig';
import { TbBox, TbBoxModel, TbSun, TbFocus2 } from 'react-icons/tb';

interface ThreeViewerProps {
  stlPath: string;
  isLoading?: boolean;
}

function STLModel({
  url,
  wireframe,
  meshRef,
  sceneStyle,
}: {
  url: string;
  wireframe: boolean;
  meshRef: React.RefObject<THREE.Mesh>;
  sceneStyle: ReturnType<typeof getPreviewSceneStyle>;
}) {
  const [geometry, setGeometry] = useState<THREE.BufferGeometry | null>(null);

  useEffect(() => {
    const loader = new STLLoader();
    loader.load(
      url,
      (loadedGeometry) => {
        loadedGeometry.computeVertexNormals();
        setGeometry(loadedGeometry);
      },
      undefined,
      (error) => {
        console.error('Error loading STL:', error);
      }
    );
  }, [url]);

  if (!geometry) {
    return null;
  }

  return (
    <mesh
      ref={meshRef}
      geometry={geometry}
      castShadow
      receiveShadow
      rotation={[-Math.PI / 2, 0, 0]}
    >
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
        />
      )}
    </mesh>
  );
}

export function ThreeViewer({ stlPath, isLoading }: ThreeViewerProps) {
  const { theme } = useTheme();
  const sceneStyle = useMemo(() => getPreviewSceneStyle(theme), [theme]);

  const [orthographic, setOrthographic] = useState(false);
  const [wireframe, setWireframe] = useState(false);
  const [showShadows, setShowShadows] = useState(true);
  const cameraControlsRef = useRef<CameraControlsType>(null);
  const meshRef = useRef<THREE.Mesh>(null);

  const handleFitToView = () => {
    if (cameraControlsRef.current && meshRef.current) {
      const box = new THREE.Box3().setFromObject(meshRef.current);
      cameraControlsRef.current.fitToBox(box, true);
    }
  };

  return (
    <div className="w-full h-full relative" style={{ backgroundColor: sceneStyle.backgroundColor }}>
      {/* Loading overlay - shows on top of viewer during rendering */}
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
      {/* Control Panel - Top Right */}
      <div className="absolute top-2 right-2 z-10 flex gap-2">
        {/* Display Options */}
        <button
          onClick={handleFitToView}
          className="p-2 rounded transition-colors flex items-center justify-center"
          style={{
            backgroundColor: 'var(--bg-elevated)',
            border: '1px solid var(--border-secondary)',
            color: 'var(--text-secondary)',
          }}
          title="Fit to View"
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

      <Canvas
        shadows
        gl={{ preserveDrawingBuffer: true }}
        style={{ width: '100%', height: '100%', background: sceneStyle.backgroundColor }}
      >
        {/* Camera */}
        {orthographic ? (
          <OrthographicCamera
            makeDefault
            position={sceneStyle.camera.defaultPosition}
            zoom={sceneStyle.camera.orthographicZoom}
            near={sceneStyle.camera.orthographicNear}
            far={sceneStyle.camera.orthographicFar}
          />
        ) : (
          <PerspectiveCamera
            makeDefault
            position={sceneStyle.camera.defaultPosition}
            fov={sceneStyle.camera.perspectiveFov}
            near={sceneStyle.camera.near}
            far={sceneStyle.camera.orthographicFar}
          />
        )}

        {/* Lighting */}
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

        {/* Grid */}
        <Grid
          infiniteGrid
          cellSize={10}
          sectionSize={50}
          fadeDistance={500}
          cellColor={sceneStyle.gridColor}
          sectionColor={sceneStyle.gridSectionColor}
        />

        {/* Contact Shadows */}
        {showShadows && sceneStyle.contactShadows.enabledByDefault && (
          <ContactShadows
            position={[0, 0, 0]}
            opacity={sceneStyle.contactShadows.opacity}
            scale={sceneStyle.contactShadows.scale}
            blur={sceneStyle.contactShadows.blur}
            far={sceneStyle.contactShadows.far}
          />
        )}

        {/* STL Model */}
        <STLModel
          url={stlPath}
          wireframe={wireframe}
          meshRef={meshRef}
          sceneStyle={sceneStyle}
        />

        {/* Camera Controls */}
        <CameraControls
          ref={cameraControlsRef}
          makeDefault
          minDistance={5}
          maxDistance={sceneStyle.camera.maxDistance}
          dollySpeed={0.5}
          truckSpeed={0.5}
        />

        {/* ViewCube Gizmo */}
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
