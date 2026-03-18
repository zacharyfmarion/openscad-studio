import type * as THREE from 'three';

export type InteractionMode = 'orbit' | 'measure-distance' | 'measure-bbox' | 'section-plane';

export type MeasurementSnapKind = 'surface' | 'vertex' | 'edge';
export type AxisLock = 'x' | 'y' | 'z' | null;
export type SectionAxis = 'x' | 'y' | 'z';

export interface LoadedPreviewModel {
  root: THREE.Object3D;
  meshes: THREE.Mesh[];
  bounds: THREE.Box3;
  size: THREE.Vector3;
  center: THREE.Vector3;
  diagonal: number;
  version: string;
}

export interface SelectionState {
  objectUuid: string | null;
  point: THREE.Vector3 | null;
  normal: THREE.Vector3 | null;
  bounds: THREE.Box3 | null;
}

export interface MeasurementDraft3D {
  status: 'idle' | 'placing-start' | 'placing-end';
  start: THREE.Vector3 | null;
  current: THREE.Vector3 | null;
  snapKind: MeasurementSnapKind | null;
  axisLock: AxisLock;
}

export interface MeasurementRecord3D {
  id: string;
  start: THREE.Vector3;
  end: THREE.Vector3;
  delta: THREE.Vector3;
  distance: number;
  createdAt: number;
}

export interface SectionPlaneState {
  enabled: boolean;
  axis: SectionAxis;
  inverted: boolean;
  offset: number;
}

export interface ToolContextPanelProps {
  loadedModel: LoadedPreviewModel | null;
  measurements: MeasurementRecord3D[];
  selectedMeasurementId: string | null;
  sectionState: SectionPlaneState | null;
  draftMeasurement: MeasurementDraft3D;
  selection: SelectionState;
  onSectionStateChange: (s: SectionPlaneState) => void;
  onSectionReset: () => void;
  onMeasurementSelect: (id: string) => void;
  onMeasurementDelete: (id: string) => void;
  onMeasurementsClear: () => void;
}
