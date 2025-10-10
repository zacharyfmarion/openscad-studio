import { useEffect, useState } from 'react';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';

interface SvgViewerProps {
  src: string;
}

export function SvgViewer({ src }: SvgViewerProps) {
  const [svgContent, setSvgContent] = useState<string>('');
  const [error, setError] = useState<string>('');

  // Load SVG content and inject axes
  useEffect(() => {
    const loadSvg = async () => {
      try {
        setError('');
        const response = await fetch(src);
        if (!response.ok) {
          throw new Error(`Failed to fetch SVG: ${response.statusText}`);
        }
        const text = await response.text();

        // Parse SVG to inject axes at origin
        const parser = new DOMParser();
        const svgDoc = parser.parseFromString(text, 'image/svg+xml');
        const svgElement = svgDoc.documentElement;

        // Get viewBox to determine axis length and origin
        const viewBox = svgElement.getAttribute('viewBox');
        console.log('[SvgViewer] Original viewBox:', viewBox);

        let width = 10, height = 10, minX = 0, minY = -10;
        if (viewBox) {
          const [x, y, w, h] = viewBox.split(' ').map(Number);
          minX = x;
          minY = y;
          width = w;
          height = h;
          console.log('[SvgViewer] ViewBox parsed:', { x, y, width, height });
        }

        // Calculate stroke width relative to viewBox (very thin axes)
        const strokeWidth = Math.min(width, height) * 0.003;
        const tickSize = Math.min(width, height) * 0.1;
        const tickSpacing = Math.max(width, height) * 0.2; // Tick every 20% of dimension

        // Set SVG to fill container with percentage sizing (preserving aspect ratio)
        svgElement.setAttribute('width', '100%');
        svgElement.setAttribute('height', '100%');

        // Don't modify viewBox - keep OpenSCAD's original viewBox so coordinates stay correct

        // Make all shapes have thinner, lighter strokes for better visibility
        const allPaths = svgElement.querySelectorAll('path, circle, rect, polygon, polyline');
        allPaths.forEach((shape) => {
          const currentStroke = shape.getAttribute('stroke');
          if (currentStroke && currentStroke !== 'none') {
            shape.setAttribute('stroke', '#6b7280'); // Gray-500 for dark mode
            shape.setAttribute('stroke-width', '0.2');
          }
        });

        // Create axes group
        const axesGroup = svgDoc.createElementNS('http://www.w3.org/2000/svg', 'g');
        axesGroup.setAttribute('id', 'coordinate-axes');

        // X-axis (light gray, horizontal through y=0, extending to infinity)
        const xAxis = svgDoc.createElementNS('http://www.w3.org/2000/svg', 'line');
        xAxis.setAttribute('x1', '-999999');
        xAxis.setAttribute('y1', '0');
        xAxis.setAttribute('x2', '999999');
        xAxis.setAttribute('y2', '0');
        xAxis.setAttribute('stroke', '#9ca3af');
        xAxis.setAttribute('stroke-width', strokeWidth.toString());

        // Y-axis (light gray, vertical through x=0, extending to infinity)
        const yAxis = svgDoc.createElementNS('http://www.w3.org/2000/svg', 'line');
        yAxis.setAttribute('x1', '0');
        yAxis.setAttribute('y1', '-999999');
        yAxis.setAttribute('x2', '0');
        yAxis.setAttribute('y2', '999999');
        yAxis.setAttribute('stroke', '#9ca3af');
        yAxis.setAttribute('stroke-width', strokeWidth.toString());

        // Add tick marks along X-axis (only in visible viewBox area)
        const maxX = minX + width;
        const maxY = minY + height;

        for (let x = Math.floor(minX / tickSpacing) * tickSpacing; x <= maxX; x += tickSpacing) {
          if (Math.abs(x) < 0.001) continue; // Skip origin
          const tick = svgDoc.createElementNS('http://www.w3.org/2000/svg', 'line');
          tick.setAttribute('x1', x.toString());
          tick.setAttribute('y1', (-tickSize / 2).toString());
          tick.setAttribute('x2', x.toString());
          tick.setAttribute('y2', (tickSize / 2).toString());
          tick.setAttribute('stroke', '#9ca3af');
          tick.setAttribute('stroke-width', strokeWidth.toString());
          axesGroup.appendChild(tick);
        }

        // Add tick marks along Y-axis (only in visible viewBox area)
        for (let y = Math.floor(minY / tickSpacing) * tickSpacing; y <= maxY; y += tickSpacing) {
          if (Math.abs(y) < 0.001) continue; // Skip origin
          const tick = svgDoc.createElementNS('http://www.w3.org/2000/svg', 'line');
          tick.setAttribute('x1', (-tickSize / 2).toString());
          tick.setAttribute('y1', y.toString());
          tick.setAttribute('x2', (tickSize / 2).toString());
          tick.setAttribute('y2', y.toString());
          tick.setAttribute('stroke', '#9ca3af');
          tick.setAttribute('stroke-width', strokeWidth.toString());
          axesGroup.appendChild(tick);
        }

        axesGroup.appendChild(xAxis);
        axesGroup.appendChild(yAxis);

        // Insert axes as first child (so they appear behind content)
        svgElement.insertBefore(axesGroup, svgElement.firstChild);

        const finalSvg = new XMLSerializer().serializeToString(svgElement);
        console.log('[SvgViewer] Final SVG length:', finalSvg.length);
        console.log('[SvgViewer] Axes group added:', axesGroup.childNodes.length, 'elements');
        console.log('[SvgViewer] Axis details:', {
          xAxis: { x1: xAxis.getAttribute('x1'), y1: xAxis.getAttribute('y1'), x2: xAxis.getAttribute('x2'), y2: xAxis.getAttribute('y2'), stroke: xAxis.getAttribute('stroke'), width: xAxis.getAttribute('stroke-width') },
          yAxis: { x1: yAxis.getAttribute('x1'), y1: yAxis.getAttribute('y1'), x2: yAxis.getAttribute('x2'), y2: yAxis.getAttribute('y2'), stroke: yAxis.getAttribute('stroke'), width: yAxis.getAttribute('stroke-width') }
        });
        console.log('[SvgViewer] First 1000 chars of SVG:', finalSvg.substring(0, 1000));
        console.log('[SvgViewer] SVG contains axes group?', finalSvg.includes('coordinate-axes'));

        setSvgContent(finalSvg);
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        console.error('[SvgViewer] Failed to load SVG:', err);
        setError(errorMsg);
        setSvgContent('');
      }
    };

    if (src) {
      loadSvg();
    }
  }, [src]);

  // Show error if SVG failed to load
  if (error) {
    return (
      <div className="h-full w-full bg-gray-900 flex items-center justify-center">
        <div className="text-center text-gray-400 max-w-md px-4">
          <p className="text-lg mb-2">{error}</p>
          <p className="text-sm">The SVG file may not have been created by OpenSCAD.</p>
        </div>
      </div>
    );
  }

  // Show loading state if no content yet
  if (!svgContent) {
    return (
      <div className="h-full w-full bg-gray-900 flex items-center justify-center">
        <p className="text-gray-500">Loading SVG...</p>
      </div>
    );
  }

  return (
    <div className="relative h-full w-full bg-gray-900">
      <TransformWrapper
        initialScale={1}
        minScale={0.1}
        maxScale={10}
        centerOnInit
        wheel={{ step: 0.1 }}
      >
        {({ zoomIn, zoomOut, resetTransform }) => (
          <>
            {/* Controls - positioned inside the viewer panel */}
            <div className="absolute top-4 right-4 z-10 flex gap-2">
              <button
                onClick={() => zoomIn()}
                className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded text-sm"
                title="Zoom In"
              >
                +
              </button>
              <button
                onClick={() => zoomOut()}
                className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded text-sm"
                title="Zoom Out"
              >
                −
              </button>
              <button
                onClick={() => resetTransform()}
                className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded text-sm"
                title="Reset View"
              >
                Reset
              </button>
            </div>

            {/* SVG Container */}
            <TransformComponent
              wrapperClass="!w-full !h-full"
              contentClass="!w-full !h-full flex items-center justify-center"
            >
              <div className="w-full h-full" dangerouslySetInnerHTML={{ __html: svgContent }} />
            </TransformComponent>
          </>
        )}
      </TransformWrapper>
    </div>
  );
}
