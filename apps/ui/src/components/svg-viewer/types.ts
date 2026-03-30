export interface SvgBounds {
  minX: number;
  minY: number;
  width: number;
  height: number;
}

export interface SvgPoint {
  x: number;
  y: number;
}

export interface SvgMetrics {
  viewBox: SvgBounds;
  normalizedViewBox: SvgBounds;
  documentOrigin: SvgPoint;
  intrinsicWidth: number | null;
  intrinsicHeight: number | null;
  contentBounds: SvgBounds;
  hasGeometry: boolean;
  isEmpty: boolean;
  warnings: string[];
}

export interface ParsedSvgDocument {
  markup: string;
  metrics: SvgMetrics;
}

export interface SvgViewportState {
  scale: number;
  translateX: number;
  translateY: number;
  fitMode: 'fit' | 'actual' | 'custom';
  interactionSource: 'initial' | 'resize' | 'toolbar' | 'wheel' | 'pan' | 'keyboard';
}

export type ViewMode = 'pan' | 'measure-distance' | 'annotate';

export interface ViewerOverlaySettings {
  showAxes: boolean;
  showGrid: boolean;
  showOrigin: boolean;
  showBounds: boolean;
  showCursorCoords: boolean;
  enableGridSnap: boolean;
}

export interface OverlayLine {
  key: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  tone: 'minor' | 'major' | 'axis-x' | 'axis-y' | 'bounds' | 'measure';
}

export interface OverlayLabel {
  key: string;
  x: number;
  y: number;
  text: string;
  tone: 'bounds' | 'measure' | 'origin';
  anchor?: 'start' | 'middle' | 'end';
}

export interface OverlayRect {
  key: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface OverlayCircle {
  key: string;
  cx: number;
  cy: number;
  r: number;
  tone: 'measure' | 'measure-selected' | 'snap';
}

export interface MeasurementSnapTarget {
  id: string;
  point: SvgPoint;
  kind: 'geometry' | 'origin' | 'bounds-corner' | 'bounds-midpoint' | 'grid';
  label: string;
  priority: number;
  screenDistance: number;
}

export interface MeasurementDraft {
  status: 'idle' | 'placing-start' | 'placing-end';
  start: SvgPoint | null;
  current: SvgPoint | null;
  snappedTarget: MeasurementSnapTarget | null;
}

export interface CommittedMeasurement {
  id: string;
  start: SvgPoint;
  end: SvgPoint;
  dx: number;
  dy: number;
  distance: number;
  createdAt: number;
}

export interface OverlayMeasurement {
  id: string;
  line: OverlayLine;
  label: OverlayLabel;
  labelBox: OverlayRect;
  startMarker: OverlayCircle;
  endMarker: OverlayCircle;
  selected: boolean;
}

export interface OverlayModel {
  majorGridLines: OverlayLine[];
  minorGridLines: OverlayLine[];
  axesLines: OverlayLine[];
  boundsRect: OverlayRect | null;
  boundsLabels: OverlayLabel[];
  origin: SvgPoint | null;
  draftMeasurementLine: OverlayLine | null;
  draftMeasurementLabel: OverlayLabel | null;
  draftMeasurementMarkers: OverlayCircle[];
  draftSnapIndicator: OverlayCircle | null;
  draftSnapLabel: OverlayLabel | null;
  committedMeasurements: OverlayMeasurement[];
  gridStep: number | null;
}
