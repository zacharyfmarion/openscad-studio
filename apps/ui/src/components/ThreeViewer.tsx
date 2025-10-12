import { useEffect, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Grid, GizmoHelper, GizmoViewcube, GizmoViewport } from '@react-three/drei';
import { STLLoader } from 'three-stdlib';
import * as THREE from 'three';
import { loadSettings } from '../stores/settingsStore';
import { getTheme } from '../themes';
import { TbBox, TbBoxModel } from 'react-icons/tb';

interface ThreeViewerProps {
  stlPath: string;
  isLoading?: boolean;
}

function STLModel({ url, wireframe }: { url: string; wireframe: boolean }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const [modelColor, setModelColor] = useState(() => {
    const settings = loadSettings();
    const theme = getTheme(settings.appearance.theme);
    return theme.colors.accent.secondary;
  });

  useEffect(() => {
    const loader = new STLLoader();
    loader.load(
      url,
      (geometry) => {
        if (meshRef.current) {
          geometry.computeVertexNormals();
          meshRef.current.geometry = geometry;
        }
      },
      undefined,
      (error) => {
        console.error('Error loading STL:', error);
      }
    );
  }, [url]);

  // Update model color when theme changes
  useEffect(() => {
    const interval = setInterval(() => {
      const settings = loadSettings();
      const theme = getTheme(settings.appearance.theme);
      setModelColor(theme.colors.accent.secondary);
    }, 500);

    return () => clearInterval(interval);
  }, []);

  return (
    <mesh
      ref={meshRef}
      castShadow
      receiveShadow
      rotation={[-Math.PI / 2, 0, 0]}
    >
      <meshStandardMaterial color={modelColor} wireframe={wireframe} />
    </mesh>
  );
}

export function ThreeViewer({ stlPath, isLoading }: ThreeViewerProps) {
  const [themeColors, setThemeColors] = useState(() => {
    const settings = loadSettings();
    const theme = getTheme(settings.appearance.theme);
    return {
      background: theme.colors.bg.primary,
      grid: theme.colors.border.secondary,
      gridSection: theme.colors.border.primary,
      model: theme.colors.accent.secondary,
    };
  });

  const [orthographic, setOrthographic] = useState(false);
  const [wireframe, setWireframe] = useState(false);

  // Update colors when theme changes (check periodically)
  useEffect(() => {
    const interval = setInterval(() => {
      const settings = loadSettings();
      const theme = getTheme(settings.appearance.theme);
      setThemeColors({
        background: theme.colors.bg.primary,
        grid: theme.colors.border.secondary,
        gridSection: theme.colors.border.primary,
        model: theme.colors.accent.secondary,
      });
    }, 500);

    return () => clearInterval(interval);
  }, []);

  if (isLoading) {
    return (
      <div
        className="w-full h-full flex items-center justify-center"
        style={{ backgroundColor: themeColors.background }}
      >
        <div style={{ color: 'var(--text-secondary)' }}>
          <div
            className="animate-spin h-8 w-8 border-4 rounded-full mx-auto mb-2"
            style={{
              borderColor: 'var(--border-primary)',
              borderTopColor: 'var(--accent-primary)'
            }}
          />
          <p>Loading 3D model...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full relative" style={{ backgroundColor: themeColors.background }}>
      {/* Control Panel - Top Right */}
      <div className="absolute top-2 right-2 z-10 flex gap-2">
        {/* Display Options */}
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
      </div>

      <Canvas
        camera={{ position: [30, 30, 30], fov: 50 }}
        orthographic={orthographic}
        shadows
        style={{ width: '100%', height: '100%', background: themeColors.background }}
      >
        {/* Lighting */}
        <ambientLight intensity={0.5} />
        <directionalLight
          position={[10, 10, 5]}
          intensity={1}
          castShadow
          shadow-mapSize={[1024, 1024]}
        />
        <directionalLight position={[-10, -10, -5]} intensity={0.3} />

        {/* Grid */}
        <Grid
          infiniteGrid
          cellSize={10}
          sectionSize={50}
          fadeDistance={500}
        />

        {/* STL Model */}
        <STLModel url={stlPath} wireframe={wireframe} />

        {/* Controls */}
        <OrbitControls
          enablePan={true}
          enableZoom={true}
          enableRotate={true}
          makeDefault
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
