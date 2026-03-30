import { useEffect, useRef } from 'react';
import { Layer, Line, Rect, Stage, Ellipse } from 'react-konva';
import { denormalizeViewerPoint } from './annotationGeometry';
import type {
  AnnotationShape,
  AnnotationStrokeStyle,
  DraftAnnotation,
  ViewerSurfaceSize,
} from './types';

interface AnnotationOverlayProps {
  surface: ViewerSurfaceSize;
  shapes: AnnotationShape[];
  draft: DraftAnnotation | null;
  strokeStyle?: Partial<AnnotationStrokeStyle>;
  onStageReady?: (stage: import('konva/lib/Stage').Stage | null) => void;
  onStart: (point: { x: number; y: number }) => void;
  onMove: (point: { x: number; y: number }) => void;
  onEnd: () => void;
}

const DEFAULT_STROKE_STYLE: AnnotationStrokeStyle = {
  stroke: '#dc322f',
  strokeWidth: 3,
  dash: [],
};

function getShapeBounds(
  shape: Extract<AnnotationShape, { kind: 'box' | 'oval' }>,
  surface: ViewerSurfaceSize
) {
  const start = denormalizeViewerPoint(shape.start, surface);
  const end = denormalizeViewerPoint(shape.end, surface);
  const left = Math.min(start.x, end.x);
  const top = Math.min(start.y, end.y);
  const width = Math.abs(end.x - start.x);
  const height = Math.abs(end.y - start.y);
  return { left, top, width, height };
}

function pointsToFlatArray(
  points: DraftAnnotation['points'] | Extract<AnnotationShape, { kind: 'freehand' }>['points'],
  surface: ViewerSurfaceSize
) {
  return points.flatMap((point) => {
    const pixelPoint = denormalizeViewerPoint(point, surface);
    return [pixelPoint.x, pixelPoint.y];
  });
}

export function AnnotationOverlay({
  surface,
  shapes,
  draft,
  strokeStyle,
  onStageReady,
  onStart,
  onMove,
  onEnd,
}: AnnotationOverlayProps) {
  const stageRef = useRef<import('konva/lib/Stage').Stage | null>(null);
  const resolvedStrokeStyle = {
    ...DEFAULT_STROKE_STYLE,
    ...strokeStyle,
  };

  useEffect(() => {
    onStageReady?.(stageRef.current);
  }, [onStageReady, surface.width, surface.height]);

  return (
    <div
      className="absolute inset-0 z-30"
      style={{ touchAction: 'none' }}
      data-testid="viewer-annotation-overlay"
    >
      <Stage
        ref={(stage) => {
          stageRef.current = stage;
          onStageReady?.(stage);
        }}
        width={surface.width}
        height={surface.height}
        onMouseDown={(event) => {
          const position = event.target.getStage()?.getPointerPosition();
          if (position) {
            onStart(position);
          }
        }}
        onMouseMove={(event) => {
          const position = event.target.getStage()?.getPointerPosition();
          if (position) {
            onMove(position);
          }
        }}
        onMouseUp={() => onEnd()}
        onTouchStart={(event) => {
          const position = event.target.getStage()?.getPointerPosition();
          if (position) {
            onStart(position);
          }
        }}
        onTouchMove={(event) => {
          const position = event.target.getStage()?.getPointerPosition();
          if (position) {
            onMove(position);
          }
        }}
        onTouchEnd={() => onEnd()}
      >
        <Layer listening={false}>
          {shapes.map((shape) => {
            if (shape.kind === 'freehand') {
              return (
                <Line
                  key={shape.id}
                  points={pointsToFlatArray(shape.points, surface)}
                  stroke={resolvedStrokeStyle.stroke}
                  strokeWidth={resolvedStrokeStyle.strokeWidth}
                  lineCap="round"
                  lineJoin="round"
                />
              );
            }

            const { left, top, width, height } = getShapeBounds(shape, surface);
            if (shape.kind === 'oval') {
              return (
                <Ellipse
                  key={shape.id}
                  x={left + width / 2}
                  y={top + height / 2}
                  radiusX={width / 2}
                  radiusY={height / 2}
                  stroke={resolvedStrokeStyle.stroke}
                  strokeWidth={resolvedStrokeStyle.strokeWidth}
                  dash={resolvedStrokeStyle.dash}
                />
              );
            }

            return (
              <Rect
                key={shape.id}
                x={left}
                y={top}
                width={width}
                height={height}
                stroke={resolvedStrokeStyle.stroke}
                strokeWidth={resolvedStrokeStyle.strokeWidth}
                dash={resolvedStrokeStyle.dash}
              />
            );
          })}

          {draft?.tool === 'freehand' ? (
            <Line
              points={pointsToFlatArray(draft.points, surface)}
              stroke={resolvedStrokeStyle.stroke}
              strokeWidth={resolvedStrokeStyle.strokeWidth}
              lineCap="round"
              lineJoin="round"
            />
          ) : null}

          {draft?.tool === 'box'
            ? (() => {
                const bounds = getShapeBounds(
                  {
                    id: draft.id,
                    kind: 'box',
                    start: draft.start,
                    end: draft.current,
                  },
                  surface
                );
                return (
                  <Rect
                    x={bounds.left}
                    y={bounds.top}
                    width={bounds.width}
                    height={bounds.height}
                    stroke={resolvedStrokeStyle.stroke}
                    strokeWidth={resolvedStrokeStyle.strokeWidth}
                    dash={[6, 4]}
                  />
                );
              })()
            : null}

          {draft?.tool === 'oval'
            ? (() => {
                const bounds = getShapeBounds(
                  {
                    id: draft.id,
                    kind: 'oval',
                    start: draft.start,
                    end: draft.current,
                  },
                  surface
                );
                return (
                  <Ellipse
                    x={bounds.left + bounds.width / 2}
                    y={bounds.top + bounds.height / 2}
                    radiusX={bounds.width / 2}
                    radiusY={bounds.height / 2}
                    stroke={resolvedStrokeStyle.stroke}
                    strokeWidth={resolvedStrokeStyle.strokeWidth}
                    dash={[6, 4]}
                  />
                );
              })()
            : null}
        </Layer>
      </Stage>
    </div>
  );
}
