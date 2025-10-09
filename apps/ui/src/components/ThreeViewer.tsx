import { useEffect, useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Grid } from '@react-three/drei';
import { STLLoader } from 'three-stdlib';
import * as THREE from 'three';

interface ThreeViewerProps {
  stlPath: string;
  isLoading?: boolean;
}

function STLModel({ url }: { url: string }) {
  const meshRef = useRef<THREE.Mesh>(null);

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

  return (
    <mesh ref={meshRef} castShadow receiveShadow>
      <meshStandardMaterial color="#f0b429" />
    </mesh>
  );
}

export function ThreeViewer({ stlPath, isLoading }: ThreeViewerProps) {
  if (isLoading) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-gray-900">
        <div className="text-gray-400">
          <div className="animate-spin h-8 w-8 border-4 border-gray-600 border-t-blue-500 rounded-full mx-auto mb-2"></div>
          <p>Loading 3D model...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full bg-gray-900">
      <Canvas
        camera={{ position: [30, 30, 30], fov: 50 }}
        shadows
        style={{ width: '100%', height: '100%' }}
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
          cellColor="#444444"
          sectionSize={5}
          sectionThickness={1}
          sectionColor="#666666"
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
