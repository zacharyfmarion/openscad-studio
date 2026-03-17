import * as THREE from 'three';
import {
  clampSectionOffset,
  createClippingPlane,
  createDefaultSectionPlaneState,
  getSectionAxisBounds,
} from '../three-viewer/sectionPlaneController';

describe('sectionPlaneController', () => {
  const bounds = new THREE.Box3(new THREE.Vector3(-5, -2, -1), new THREE.Vector3(5, 8, 9));

  it('creates a default section state centered on Z', () => {
    const state = createDefaultSectionPlaneState(bounds);

    expect(state.axis).toBe('z');
    expect(state.enabled).toBe(false);
    expect(state.offset).toBe(4);
  });

  it('returns axis bounds and clamps offsets', () => {
    expect(getSectionAxisBounds(bounds, 'x')).toEqual({ min: -5, max: 5 });
    expect(clampSectionOffset(bounds, 'y', 20)).toBe(8);
    expect(clampSectionOffset(bounds, 'z', -5)).toBe(-1);
  });

  it('builds a clipping plane from the section state', () => {
    const plane = createClippingPlane(bounds, {
      enabled: true,
      axis: 'x',
      inverted: false,
      offset: 2,
    });

    expect(plane.normal.toArray()).toEqual([1, 0, 0]);
    expect(Math.round(plane.constant * 100) / 100).toBe(-2);
  });
});
