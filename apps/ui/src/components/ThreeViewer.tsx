import { useEffect, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Grid } from '@react-three/drei';
import { STLLoader } from 'three-stdlib';
import * as THREE from 'three';
import { loadSettings } from '../stores/settingsStore';
import { getTheme } from '../themes';

interface ThreeViewerProps {
  stlPath: string;
  isLoading?: boolean;
}

function STLModel({ url }: { url: string }) {
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
          geometry.center();
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
      <meshStandardMaterial color={modelColor} />
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
    <div className="w-full h-full" style={{ backgroundColor: themeColors.background }}>
      <Canvas
        camera={{ position: [30, 30, 30], fov: 50 }}
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
          args={[50, 50]}
          cellSize={1}
          cellThickness={0.5}
          cellColor={themeColors.grid}
          sectionSize={5}
          sectionThickness={1}
          sectionColor={themeColors.gridSection}
          fadeDistance={80}
          fadeStrength={1}
          position={[0, -0.01, 0]}
        />

        {/* STL Model */}
        <STLModel url={stlPath} />

        {/* Controls */}
        <OrbitControls
          enablePan={true}
          enableZoom={true}
          enableRotate={true}
          makeDefault
        />
      </Canvas>
    </div>
  );
}
