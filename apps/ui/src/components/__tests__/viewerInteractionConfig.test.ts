import { VIEWER_CONTROL_ACTIONS, createViewerInteractionConfig } from '../viewerInteractionConfig';

describe('viewerInteractionConfig', () => {
  it('uses standard 3D desktop bindings by default', () => {
    const config = createViewerInteractionConfig();

    expect(config.mouseButtons.left).toBe(VIEWER_CONTROL_ACTIONS.ROTATE);
    expect(config.mouseButtons.right).toBe(VIEWER_CONTROL_ACTIONS.TRUCK);
    expect(config.mouseButtons.wheel).toBe(VIEWER_CONTROL_ACTIONS.DOLLY);
  });

  it('switches wheel and pinch interactions to zoom in orthographic mode', () => {
    const config = createViewerInteractionConfig(false, true);

    expect(config.mouseButtons.wheel).toBe(VIEWER_CONTROL_ACTIONS.ZOOM);
    expect(config.touches.two).toBe(VIEWER_CONTROL_ACTIONS.TOUCH_ZOOM_TRUCK);
  });

  it('switches left drag to pan when shift-pan is active', () => {
    const config = createViewerInteractionConfig(true);

    expect(config.mouseButtons.left).toBe(VIEWER_CONTROL_ACTIONS.TRUCK);
    expect(config.mouseButtons.right).toBe(VIEWER_CONTROL_ACTIONS.TRUCK);
  });

  it('uses touch mappings for orbit and pan/zoom gestures', () => {
    const config = createViewerInteractionConfig();

    expect(config.touches.one).toBe(VIEWER_CONTROL_ACTIONS.TOUCH_ROTATE);
    expect(config.touches.two).toBe(VIEWER_CONTROL_ACTIONS.TOUCH_DOLLY_TRUCK);
    expect(config.touches.three).toBe(VIEWER_CONTROL_ACTIONS.TOUCH_TRUCK);
  });

  it('exposes matching desktop and touch hint copy', () => {
    const config = createViewerInteractionConfig();

    expect(config.desktopHint).toContain('Right-drag');
    expect(config.desktopHint).toContain('Shift-drag');
    expect(config.touchHint).toContain('Two fingers');
  });
});
