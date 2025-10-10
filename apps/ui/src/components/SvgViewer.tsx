import { useEffect, useRef, useState } from 'react';
import { convertFileSrc } from '@tauri-apps/api/core';

interface SvgViewerProps {
  src: string;
}

export function SvgViewer({ src }: SvgViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [svgContent, setSvgContent] = useState<string>('');
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  // Load SVG content
  useEffect(() => {
    const loadSvg = async () => {
      try {
        const assetUrl = convertFileSrc(src);
        const response = await fetch(assetUrl);
        const text = await response.text();
        setSvgContent(text);
      } catch (err) {
        console.error('Failed to load SVG:', err);
      }
    };

    if (src) {
      loadSvg();
    }
  }, [src]);

  // Handle mouse wheel for zoom
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = -e.deltaY * 0.001;
    setZoom(prev => Math.max(0.1, Math.min(10, prev + delta)));
  };

  // Handle mouse down for pan
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 0) {
      setIsDragging(true);
      setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    }
  };

  // Handle mouse move
  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging) {
      setPan({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y,
      });
    }
  };

  // Handle mouse up
  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Reset view
  const handleReset = () => {
    setPan({ x: 0, y: 0 });
    setZoom(1);
  };

  return (
    <div className="relative h-full w-full bg-gray-900 overflow-hidden">
      {/* Controls */}
      <div className="absolute top-4 right-4 z-10 flex gap-2">
        <button
          onClick={() => setZoom(prev => Math.min(10, prev + 0.2))}
          className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded text-sm"
          title="Zoom In"
        >
          +
        </button>
        <button
          onClick={() => setZoom(prev => Math.max(0.1, prev - 0.2))}
          className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded text-sm"
          title="Zoom Out"
        >
          −
        </button>
        <button
          onClick={handleReset}
          className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded text-sm"
          title="Reset View"
        >
          Reset
        </button>
      </div>

      {/* SVG Container */}
      <div
        ref={containerRef}
        className="h-full w-full flex items-center justify-center cursor-move"
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <div
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: 'center',
          }}
          dangerouslySetInnerHTML={{ __html: svgContent }}
        />
      </div>

      {/* Zoom indicator */}
      <div className="absolute bottom-4 right-4 px-2 py-1 bg-gray-800 border border-gray-700 rounded text-xs">
        {Math.round(zoom * 100)}%
      </div>
    </div>
  );
}
