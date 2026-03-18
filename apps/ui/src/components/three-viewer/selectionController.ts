import * as THREE from 'three';
import type { LoadedPreviewModel, SelectionState } from './types';

export interface RaycastResult {
  intersection: THREE.Intersection<THREE.Object3D>;
  point: THREE.Vector3;
  normal: THREE.Vector3 | null;
}

export function getNormalizedPointer(
  clientX: number,
  clientY: number,
  rect: Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>
): THREE.Vector2 {
  return new THREE.Vector2(
    ((clientX - rect.left) / Math.max(rect.width, 1)) * 2 - 1,
    -(((clientY - rect.top) / Math.max(rect.height, 1)) * 2 - 1)
  );
}

export function raycastLoadedModel(args: {
  clientX: number;
  clientY: number;
  rect: Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>;
  camera: THREE.Camera;
  model: LoadedPreviewModel | null;
  raycaster?: THREE.Raycaster;
}): RaycastResult | null {
  const { clientX, clientY, rect, camera, model, raycaster = new THREE.Raycaster() } = args;

  if (!model) {
    return null;
  }

  const pointer = getNormalizedPointer(clientX, clientY, rect);
  raycaster.setFromCamera(pointer, camera);

  const hits = raycaster.intersectObject(model.root, true);
  const hit = hits.find((candidate) => candidate.object instanceof THREE.Mesh);

  if (!hit) {
    return null;
  }

  return {
    intersection: hit,
    point: hit.point.clone(),
    normal: getWorldNormalFromIntersection(hit),
  };
}

export function getWorldNormalFromIntersection(
  intersection: THREE.Intersection<THREE.Object3D>
): THREE.Vector3 | null {
  if (!intersection.face) {
    return null;
  }

  const normalMatrix = new THREE.Matrix3().getNormalMatrix(intersection.object.matrixWorld);
  return intersection.face.normal.clone().applyMatrix3(normalMatrix).normalize();
}

export function createSelectionStateFromRaycast(
  model: LoadedPreviewModel | null,
  raycast: RaycastResult | null
): SelectionState {
  if (!model || !raycast) {
    return {
      objectUuid: null,
      point: null,
      normal: null,
      bounds: null,
    };
  }

  return {
    objectUuid: raycast.intersection.object.uuid,
    point: raycast.point.clone(),
    normal: raycast.normal?.clone() ?? null,
    bounds: model.bounds.clone(),
  };
}
