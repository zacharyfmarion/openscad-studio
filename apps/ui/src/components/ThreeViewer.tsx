import { useEffect, useRef, useState, useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { CameraControls, Grid, GizmoHelper, GizmoViewcube, OrthographicCamera, PerspectiveCamera, ContactShadows, Environment, Wireframe as DreiWireframe } from '@react-three/drei';
import { STLLoader } from 'three-stdlib';
import * as THREE from 'three';
import { useTheme } from '../contexts/ThemeContext';
import { TbBox, TbBoxModel, TbSun, TbFocus2 } from 'react-icons/tb';

interface ThreeViewerProps {
  stlPath: string;
  isLoading?: boolean;
}

function STLModel({ url, wireframe, meshRef, modelColor }: { url: string; wireframe: boolean; meshRef: React.RefObject<THREE.Mesh>; modelColor: string }) {
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
            color={modelColor}
            transparent
            opacity={0.2}
            side={THREE.DoubleSide}
          />
          <DreiWireframe
            geometry={geometry}
            stroke={modelColor}
            thickness={0.05}
            fillOpacity={0}
            strokeOpacity={0.9}
          />
        </>
      ) : (
        <meshStandardMaterial color={modelColor} metalness={0.3} roughness={0.4} />
      )}
    </mesh>
  );
}

export function ThreeViewer({ stlPath, isLoading }: ThreeViewerProps) {
  const { theme } = useTheme();

  // Derive theme colors from context
  const themeColors = useMemo(() => ({
    background: theme.colors.bg.primary,
    grid: theme.colors.border.secondary,
    gridSection: theme.colors.border.primary,
    model: theme.colors.accent.secondary,
  }), [theme]);

  const [orthographic, setOrthographic] = useState(false);
  const [wireframe, setWireframe] = useState(false);
  const [showShadows, setShowShadows] = useState(true);
  const cameraControlsRef = useRef<any>(null);
  const meshRef = useRef<THREE.Mesh>(null);

  const handleFitToView = () => {
    if (cameraControlsRef.current && meshRef.current) {
      const box = new THREE.Box3().setFromObject(meshRef.current);
      cameraControlsRef.current.fitToBox(box, true);
    }
  };

  return (
    <div className="w-full h-full relative" style={{ backgroundColor: themeColors.background }}>
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
                borderTopColor: 'var(--accent-primary)'
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
            color: 'var(--text-secondary)'
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
            color: orthographic ? 'var(--text-inverse)' : 'var(--text-secondary)'
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
            color: wireframe ? 'var(--text-inverse)' : 'var(--text-secondary)'
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
            color: showShadows ? 'var(--text-inverse)' : 'var(--text-secondary)'
          }}
          title="Toggle Shadows"
        >
          <TbSun size={18} />
        </button>
      </div>

      <Canvas
        shadows
        style={{ width: '100%', height: '100%', background: themeColors.background }}
      >
        {/* Camera */}
        {orthographic ? (
          <OrthographicCamera makeDefault position={[100, 100, 100]} zoom={2} near={-1000} far={2000} />
        ) : (
          <PerspectiveCamera makeDefault position={[100, 100, 100]} fov={50} near={0.1} far={2000} />
        )}

        {/* Lighting */}
        <Environment preset="city" />
        <ambientLight intensity={0.5} />
        <directionalLight
          position={[10, 10, 5]}
          intensity={1}
          castShadow
          shadow-mapSize={[2048, 2048]}
        />

        {/* Grid */}
        <Grid
          infiniteGrid
          cellSize={10}
          sectionSize={50}
          fadeDistance={500}
        />

        {/* Contact Shadows */}
        {showShadows && (
          <ContactShadows
            position={[0, 0, 0]}
            opacity={0.3}
            scale={200}
            blur={2}
            far={50}
          />
        )}

        {/* STL Model */}
        <STLModel url={stlPath} wireframe={wireframe} meshRef={meshRef} modelColor={themeColors.model} />

        {/* Camera Controls */}
        <CameraControls
          ref={cameraControlsRef}
          makeDefault
          minDistance={5}
          maxDistance={500}
          dollySpeed={0.5}
          truckSpeed={0.5}
        />

        {/* ViewCube Gizmo */}
        <GizmoHelper alignment="bottom-left" margin={[80, 80]}>
          <GizmoViewcube
            font="16px Inter, sans-serif"
            opacity={1}
            faces={['Front', 'Back', 'Top', 'Bottom', 'Left', 'Right']}
            textColor={themeColors.background}
            color={themeColors.model}
          />
        </GizmoHelper>
      </Canvas>
    </div>
  );
}
