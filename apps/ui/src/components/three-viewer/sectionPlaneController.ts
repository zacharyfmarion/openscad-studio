import * as THREE from 'three';
import type { SectionAxis, SectionPlaneState } from './types';

export function getSectionAxisVector(axis: SectionAxis, inverted: boolean) {
  const scalar = inverted ? -1 : 1;
  switch (axis) {
    case 'x':
      return new THREE.Vector3(scalar, 0, 0);
    case 'y':
      return new THREE.Vector3(0, scalar, 0);
    case 'z':
    default:
      return new THREE.Vector3(0, 0, scalar);
  }
}

export function getSectionAxisBounds(bounds: THREE.Box3, axis: SectionAxis) {
  if (axis === 'x') {
    return { min: bounds.min.x, max: bounds.max.x };
  }
  if (axis === 'y') {
    return { min: bounds.min.y, max: bounds.max.y };
  }
  return { min: bounds.min.z, max: bounds.max.z };
}

export function createDefaultSectionPlaneState(bounds: THREE.Box3): SectionPlaneState {
  const z = getSectionAxisBounds(bounds, 'z');
  return {
    enabled: false,
    axis: 'z',
    inverted: false,
    offset: (z.min + z.max) / 2,
  };
}

export function clampSectionOffset(bounds: THREE.Box3, axis: SectionAxis, offset: number) {
  const { min, max } = getSectionAxisBounds(bounds, axis);
  return Math.min(max, Math.max(min, offset));
}

export function createClippingPlane(bounds: THREE.Box3, state: SectionPlaneState) {
  const normal = getSectionAxisVector(state.axis, state.inverted);
  const point = bounds.getCenter(new THREE.Vector3());

  if (state.axis === 'x') {
    point.x = state.offset;
  } else if (state.axis === 'y') {
    point.y = state.offset;
  } else {
    point.z = state.offset;
  }

  return new THREE.Plane().setFromNormalAndCoplanarPoint(normal, point);
}

export function getSectionPlaneVisualTransform(bounds: THREE.Box3, state: SectionPlaneState) {
  const center = bounds.getCenter(new THREE.Vector3());
  const size = bounds.getSize(new THREE.Vector3());
  const diagonal = size.length();
  const position = center.clone();
  const quaternion = new THREE.Quaternion();

  if (state.axis === 'x') {
    position.x = state.offset;
    quaternion.setFromEuler(new THREE.Euler(0, Math.PI / 2, 0));
  } else if (state.axis === 'y') {
    position.y = state.offset;
    quaternion.setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));
  } else {
    position.z = state.offset;
    quaternion.identity();
  }

  return {
    position,
    quaternion,
    size: Math.max(diagonal * 1.1, 1),
  };
}
