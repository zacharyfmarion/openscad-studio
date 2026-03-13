import { getTheme } from '../../themes';
import {
  FALLBACK_PREVIEW_SCENE_STYLE,
  getPreviewSceneStyle,
} from '../previewSceneConfig';

describe('previewSceneConfig', () => {
  it('maps theme colors into shared preview scene tokens', () => {
    const theme = getTheme('rose-pine');
    const sceneStyle = getPreviewSceneStyle(theme);

    expect(sceneStyle.backgroundColor).toBe(theme.colors.bg.primary);
    expect(sceneStyle.gridColor).toBe(theme.colors.border.secondary);
    expect(sceneStyle.gridSectionColor).toBe(theme.colors.border.primary);
    expect(sceneStyle.modelColor).toBe(theme.colors.accent.secondary);
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
  });
});
