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
    expect(settings.privacy.analyticsEnabled).toBe(false);
    expect(settings.ui.hasCompletedNux).toBe(true);
  });
});
