/** @jest-environment jsdom */

import { loadSettings } from '../settingsStore';

describe('settingsStore', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('fills in viewer defaults when loading older saved settings', () => {
    localStorage.setItem(
      'openscad-studio-settings',
      JSON.stringify({
        ui: { hasCompletedNux: true },
        privacy: { analyticsEnabled: false },
      })
    );

    const settings = loadSettings();

    expect(settings.viewer.showAxes).toBe(true);
    expect(settings.viewer.showAxisLabels).toBe(true);
    expect(settings.viewer.show3DGrid).toBe(true);
    expect(settings.viewer.showShadows).toBe(true);
    expect(settings.viewer.showModelColors).toBe(true);
    expect(settings.viewer.showViewcube).toBe(true);
    expect(settings.viewer.measurementSnapEnabled).toBe(true);
    expect(settings.viewer.showSelectionInfo).toBe(true);
    expect(settings.viewer.show2DAxes).toBe(true);
    expect(settings.viewer.show2DGrid).toBe(true);
    expect(settings.viewer.show2DOrigin).toBe(true);
    expect(settings.viewer.show2DBounds).toBe(false);
    expect(settings.viewer.show2DCursorCoords).toBe(true);
    expect(settings.viewer.enable2DGridSnap).toBe(true);
    expect(settings.privacy.analyticsEnabled).toBe(false);
    expect(settings.ui.hasCompletedNux).toBe(true);
    expect(settings.mcp.enabled).toBe(true);
    expect(settings.mcp.port).toBe(32123);
  });
});
