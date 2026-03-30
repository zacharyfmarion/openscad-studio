export type AnnotationTool = 'box' | 'oval' | 'freehand';

export interface NormalizedPoint {
  x: number;
  y: number;
}

export interface BoxAnnotationShape {
  id: string;
  kind: 'box';
  start: NormalizedPoint;
  end: NormalizedPoint;
}

export interface OvalAnnotationShape {
  id: string;
  kind: 'oval';
  start: NormalizedPoint;
  end: NormalizedPoint;
}

export interface FreehandAnnotationShape {
  id: string;
  kind: 'freehand';
  points: NormalizedPoint[];
}

export type AnnotationShape = BoxAnnotationShape | OvalAnnotationShape | FreehandAnnotationShape;

export interface ViewerSurfaceSize {
  width: number;
  height: number;
}

export interface DraftAnnotation {
  id: string;
  tool: AnnotationTool;
  start: NormalizedPoint;
  current: NormalizedPoint;
  points: NormalizedPoint[];
}

export interface AnnotationStrokeStyle {
  stroke: string;
  strokeWidth: number;
  dash: number[];
}

export type ViewerAnnotationAttachResult =
  | { status: 'attached' }
  | { status: 'missing-api-key' }
  | { status: 'busy' }
  | { status: 'failed'; errors: string[] };
