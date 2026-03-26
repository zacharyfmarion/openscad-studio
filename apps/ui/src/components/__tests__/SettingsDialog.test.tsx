/** @jest-environment jsdom */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { jest } from '@jest/globals';
import { SettingsDialog } from '../SettingsDialog';
import { ThemeProvider } from '../../contexts/ThemeContext';

const mockGetPlatform = jest.fn();
const mockTrack = jest.fn();
const mockApplyWorkspacePreset = jest.fn();
let platformMock: {
  getLibraryPaths: ReturnType<typeof jest.fn>;
  capabilities: { hasFileSystem: boolean };
};

jest.mock('../../platform', () => ({
  getPlatform: () => mockGetPlatform(),
}));

jest.mock('@monaco-editor/react', () => ({
  Editor: () => null,
}));

jest.mock('../../analytics/runtime', () => ({
  useAnalytics: () => ({
    track: (...args: unknown[]) => mockTrack(...args),
    trackError: jest.fn(),
    setAnalyticsEnabled: jest.fn(),
  }),
}));

jest.mock('../../stores/layoutStore', () => ({
  applyWorkspacePreset: (...args: unknown[]) => mockApplyWorkspacePreset(...args),
}));

describe('SettingsDialog privacy copy', () => {
  beforeEach(() => {
    localStorage.clear();
    jest.clearAllMocks();
    platformMock = {
      getLibraryPaths: jest.fn(async () => []),
      capabilities: { hasFileSystem: true },
    };
    mockGetPlatform.mockReturnValue(platformMock);

    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: jest.fn().mockImplementation(() => ({
        matches: false,
        media: '(prefers-color-scheme: dark)',
        onchange: null,
        addListener: jest.fn(),
        removeListener: jest.fn(),
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        dispatchEvent: jest.fn(),
      })),
    });
  });

  it('shows the tightened privacy copy and respects persisted opt-out state', async () => {
    localStorage.setItem(
      'openscad-studio-settings',
      JSON.stringify({
        privacy: { analyticsEnabled: false },
      })
    );

    render(
      <ThemeProvider>
        <SettingsDialog isOpen onClose={() => {}} initialTab="privacy" />
      </ThemeProvider>
    );

    expect(await screen.findByText('Share anonymous product analytics')).toBeTruthy();
    expect(
      screen.getByText(/persistent anonymous identifier on this device\/browser/i)
    ).toBeTruthy();
    expect(screen.getByText(/turning this off stops future analytics capture/i)).toBeTruthy();
    expect(screen.getByText(/on the web it applies per browser\/profile/i)).toBeTruthy();

    await waitFor(() => {
      expect(platformMock.getLibraryPaths).toHaveBeenCalledTimes(1);
    });

    const toggle = screen.getByRole('checkbox');
    expect((toggle as HTMLInputElement).checked).toBe(false);
  });

  it('shows viewer settings and disables axis labels when axes are hidden', async () => {
    localStorage.setItem(
      'openscad-studio-settings',
      JSON.stringify({
        viewer: {
          showAxes: false,
          showAxisLabels: false,
          show3DGrid: false,
          showShadows: false,
          showViewcube: false,
          measurementSnapEnabled: false,
          showSelectionInfo: false,
          show2DGrid: false,
          show2DAxes: false,
        },
      })
    );

    render(
      <ThemeProvider>
        <SettingsDialog isOpen onClose={() => {}} initialTab="viewer" />
      </ThemeProvider>
    );

    // 3D and 2D content are both visible without any tab switching
    expect(await screen.findByText('Show axes')).toBeTruthy();
    expect(screen.getByText('3D Viewer')).toBeTruthy();
    expect(screen.getByText('2D Viewer')).toBeTruthy();

    const axesToggle = screen.getByLabelText('Show axes') as HTMLInputElement;
    const axisLabelsToggle = screen.getByLabelText('Show axis labels') as HTMLInputElement;
    const threeDGridToggle = screen.getByLabelText('Show 3D grid') as HTMLInputElement;
    const shadowsToggle = screen.getByLabelText('Show shadows') as HTMLInputElement;
    const viewcubeToggle = screen.getByLabelText('Show viewcube') as HTMLInputElement;
    const snapToggle = screen.getByLabelText('Snap 3D measurements') as HTMLInputElement;
    const inspectionHudToggle = screen.getByLabelText('Show inspection HUD') as HTMLInputElement;

    expect(axesToggle.checked).toBe(false);
    expect(axisLabelsToggle.checked).toBe(false);
    expect(axisLabelsToggle.disabled).toBe(true);
    expect(threeDGridToggle.checked).toBe(false);
    expect(shadowsToggle.checked).toBe(false);
    expect(viewcubeToggle.checked).toBe(false);
    expect(snapToggle.checked).toBe(false);
    expect(inspectionHudToggle.checked).toBe(false);

    const gridToggle = screen.getByLabelText('Show 2D grid') as HTMLInputElement;
    const twoDAxesToggle = screen.getByLabelText('Show 2D axes') as HTMLInputElement;
    expect(gridToggle.checked).toBe(false);
    expect(twoDAxesToggle.checked).toBe(false);
  });

  it('offers Customizer First as a default layout option', async () => {
    render(
      <ThemeProvider>
        <SettingsDialog isOpen onClose={() => {}} initialTab="appearance" />
      </ThemeProvider>
    );

    expect(await screen.findByText('Default Layout')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Customizer First' })).toBeTruthy();
  });

  it('tracks layout selection sources and viewer preference changes', async () => {
    const { unmount } = render(
      <ThemeProvider>
        <SettingsDialog isOpen onClose={() => {}} initialTab="appearance" />
      </ThemeProvider>
    );

    await screen.findByText('Default Layout');
    fireEvent.click(screen.getByRole('button', { name: 'Customizer First' }));
    fireEvent.click(screen.getByRole('button', { name: 'Reset layout' }));

    expect(mockTrack).toHaveBeenCalledWith(
      'workspace layout selected',
      expect.objectContaining({
        preset: 'customizer-first',
        source: 'settings',
        is_first_run: false,
      })
    );
    expect(mockTrack).toHaveBeenCalledWith(
      'workspace layout selected',
      expect.objectContaining({
        preset: 'customizer-first',
        source: 'layout_reset',
        is_first_run: false,
      })
    );
    expect(mockApplyWorkspacePreset).toHaveBeenCalledWith('customizer-first');
    unmount();

    render(
      <ThemeProvider>
        <SettingsDialog isOpen onClose={() => {}} initialTab="viewer" />
      </ThemeProvider>
    );

    await screen.findByText('Show axes');
    fireEvent.click(screen.getByLabelText('Snap 3D measurements'));
    fireEvent.click(screen.getByRole('button', { name: 'Project' }));
    fireEvent.change(screen.getByLabelText('Measurement Unit'), { target: { value: 'in' } });

    expect(mockTrack).toHaveBeenCalledWith(
      'viewer preference changed',
      expect.objectContaining({
        setting: 'measurement_unit',
        value: 'in',
      })
    );
    expect(mockTrack).toHaveBeenCalledWith(
      'viewer preference changed',
      expect.objectContaining({
        setting: 'measurement_snap_enabled',
        enabled: false,
      })
    );
  });
});
