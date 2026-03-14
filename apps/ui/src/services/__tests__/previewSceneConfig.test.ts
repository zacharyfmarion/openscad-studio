import { getTheme } from '../../themes';
import { FALLBACK_PREVIEW_SCENE_STYLE, getPreviewSceneStyle } from '../previewSceneConfig';

describe('previewSceneConfig', () => {
  it('maps theme colors into shared preview scene tokens', () => {
    const theme = getTheme('rose-pine');
    const sceneStyle = getPreviewSceneStyle(theme);

    expect(sceneStyle.backgroundColor).toBe(theme.colors.bg.primary);
    expect(sceneStyle.gridColor).toBe(theme.colors.border.secondary);
    expect(sceneStyle.gridSectionColor).toBe(theme.colors.border.primary);
    expect(sceneStyle.modelColor).toBe(theme.colors.accent.secondary);
    expect(sceneStyle.axis.xColor).toBe(theme.colors.accent.primary);
    expect(sceneStyle.axis.yColor).toBe(theme.colors.accent.secondary);
    expect(sceneStyle.axis.zColor).toBe(theme.colors.semantic.error);
    expect(sceneStyle.axis.labelColor).toBe(theme.colors.text.secondary);
  });

  it('keeps stable fallback defaults for offscreen capture', () => {
    expect(FALLBACK_PREVIEW_SCENE_STYLE.environmentPreset).toBe('city');
    expect(FALLBACK_PREVIEW_SCENE_STYLE.screenshot).toEqual({
      width: 800,
      height: 600,
    });
    expect(FALLBACK_PREVIEW_SCENE_STYLE.camera.baseFar).toBe(2000);
    expect(FALLBACK_PREVIEW_SCENE_STYLE.camera.baseMaxDistance).toBe(500);
    expect(FALLBACK_PREVIEW_SCENE_STYLE.camera.frameDistanceMultiplier).toBe(2.5);
    expect(FALLBACK_PREVIEW_SCENE_STYLE.material.envMapIntensity).toBe(0.9);
    expect(FALLBACK_PREVIEW_SCENE_STYLE.axis.xColor).toBe('#5cc8ff');
    expect(FALLBACK_PREVIEW_SCENE_STYLE.axis.zColor).toBe('#ef476f');
  });
});
