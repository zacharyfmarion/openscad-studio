/** @jest-environment jsdom */

import * as THREE from 'three';
import { buildPreview3dObject, parseOffPreviewModel } from '../preview3dModel';
import { FALLBACK_PREVIEW_SCENE_STYLE } from '../previewSceneConfig';

describe('parseOffPreviewModel', () => {
  it('parses a single colored face set into one material group', () => {
    const parsed = parseOffPreviewModel({
      content: ['OFF 4 1 0', '0 0 0', '1 0 0', '1 1 0', '0 1 0', '4 0 1 2 3 255 0 0'].join('\n'),
      fallbackColor: FALLBACK_PREVIEW_SCENE_STYLE.modelColor,
      version: 'single',
    });

    expect(parsed.groups).toHaveLength(1);
    expect(parsed.groups[0].geometry.index).toBeNull();
    expect(parsed.groups[0].geometry.getAttribute('position').count).toBe(6);
    expect(parsed.groups[0].geometry.getAttribute('normal').count).toBe(6);
    expect(parsed.groups[0].color.getHexString()).toBe('ff0000');
    expect(parsed.groups[0].opacity).toBe(1);

    parsed.dispose();
  });

  it('triangulates concave OFF faces without falling back to broken fan geometry', () => {
    const parsed = parseOffPreviewModel({
      content: [
        'OFF 5 1 0',
        '0 0 0',
        '2 0 0',
        '2 1 0',
        '1 0.4 0',
        '0 1 0',
        '5 0 1 2 3 4 255 200 0',
      ].join('\n'),
      fallbackColor: FALLBACK_PREVIEW_SCENE_STYLE.modelColor,
      version: 'concave',
    });

    expect(parsed.groups).toHaveLength(1);
    expect(parsed.groups[0].geometry.getAttribute('position').count).toBe(9);
    expect(parsed.groups[0].geometry.getAttribute('normal').count).toBe(9);

    parsed.dispose();
  });

  it('splits differently colored faces into separate groups and preserves alpha', () => {
    const parsed = parseOffPreviewModel({
      content: [
        'OFF 8 2 0',
        '0 0 0',
        '1 0 0',
        '1 1 0',
        '0 1 0',
        '0 0 1',
        '1 0 1',
        '1 1 1',
        '0 1 1',
        '4 0 1 2 3 255 0 0',
        '4 4 5 6 7 0 0 255 127',
      ].join('\n'),
      fallbackColor: FALLBACK_PREVIEW_SCENE_STYLE.modelColor,
      version: 'multi',
    });

    expect(parsed.groups).toHaveLength(2);
    expect(parsed.groups.map((group) => group.color.getHexString()).sort()).toEqual([
      '0000ff',
      'ff0000',
    ]);

    const translucentGroup = parsed.groups.find((group) => group.color.getHexString() === '0000ff');
    expect(translucentGroup?.transparent).toBe(true);
    expect(translucentGroup?.opacity).toBeCloseTo(127 / 255, 4);

    parsed.dispose();
  });

  it('treats 0 0 0 0 color as fallback (OpenSCAD "Invalid color in OFF export")', () => {
    const parsed = parseOffPreviewModel({
      content: ['OFF 4 1 0', '0 0 0', '1 0 0', '1 1 0', '0 1 0', '4 0 1 2 3 0 0 0 0'].join('\n'),
      fallbackColor: '#123456',
      version: 'zero-color',
    });

    expect(parsed.groups).toHaveLength(1);
    // Should use fallback, not render as invisible (alpha=0)
    expect(parsed.groups[0].color.getHexString()).toBe('123456');
    expect(parsed.groups[0].opacity).toBe(1);
    expect(parsed.groups[0].transparent).toBe(false);

    parsed.dispose();
  });

  it('falls back to the preview material color when a face omits explicit OFF color data', () => {
    const parsed = parseOffPreviewModel({
      content: ['OFF 4 1 0', '0 0 0', '1 0 0', '1 1 0', '0 1 0', '4 0 1 2 3'].join('\n'),
      fallbackColor: '#123456',
      version: 'fallback',
    });

    expect(parsed.groups).toHaveLength(1);
    expect(parsed.groups[0].color.getHexString()).toBe('123456');

    parsed.dispose();
  });
});

describe('buildPreview3dObject', () => {
  it('creates a rotated group of meshes and disposes materials without touching geometry', () => {
    const parsed = parseOffPreviewModel({
      content: ['OFF 4 1 0', '0 0 0', '1 0 0', '1 1 0', '0 1 0', '4 0 1 2 3 255 0 0'].join('\n'),
      fallbackColor: FALLBACK_PREVIEW_SCENE_STYLE.modelColor,
      version: 'built',
    });

    const built = buildPreview3dObject({
      parsed,
      sceneStyle: FALLBACK_PREVIEW_SCENE_STYLE,
      wireframe: true,
    });

    expect(built.meshes).toHaveLength(1);
    expect(built.root.rotation.x).toBeCloseTo(-Math.PI / 2);
    expect(built.meshes[0].material).toBeInstanceOf(THREE.MeshBasicMaterial);
    expect(built.meshes[0].castShadow).toBe(false);
    expect(built.meshes[0].receiveShadow).toBe(false);

    built.dispose();
    parsed.dispose();
  });

  it('can ignore model colors and render with the default preview material instead', () => {
    const parsed = parseOffPreviewModel({
      content: ['OFF 4 1 0', '0 0 0', '1 0 0', '1 1 0', '0 1 0', '4 0 1 2 3 255 0 0 127'].join(
        '\n'
      ),
      fallbackColor: FALLBACK_PREVIEW_SCENE_STYLE.modelColor,
      version: 'monochrome',
    });

    const built = buildPreview3dObject({
      parsed,
      sceneStyle: FALLBACK_PREVIEW_SCENE_STYLE,
      useModelColors: false,
    });

    expect(built.meshes).toHaveLength(1);
    expect(built.meshes[0].material).toBeInstanceOf(THREE.MeshStandardMaterial);
    const material = built.meshes[0].material as THREE.MeshStandardMaterial;
    expect(material.color.getHexString()).toBe('6699cc');
    expect(material.opacity).toBe(1);
    expect(material.transparent).toBe(false);

    built.dispose();
    parsed.dispose();
  });
});
