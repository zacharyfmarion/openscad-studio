/** @jest-environment jsdom */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { jest } from '@jest/globals';
import { ThemeProvider } from '../../contexts/ThemeContext';

const mockGetPlatform = jest.fn();
const mockTrack = jest.fn();
const mockApplyWorkspacePreset = jest.fn();
const mockGetDesktopMcpStatus = jest.fn();
const mockSyncDesktopMcpConfig = jest.fn();
let platformMock: {
  getLibraryPaths: ReturnType<typeof jest.fn>;
  getDefaultProjectsDirectory: ReturnType<typeof jest.fn>;
  pickDirectory: ReturnType<typeof jest.fn>;
  capabilities: { hasFileSystem: boolean };
};

jest.unstable_mockModule('@/platform', () => ({
  getPlatform: () => mockGetPlatform(),
}));

jest.unstable_mockModule('@monaco-editor/react', () => ({
  Editor: () => null,
}));

jest.unstable_mockModule('@/analytics/runtime', () => ({
  bucketCount: (value: number) => String(value),
  createAnalyticsApi: () => ({
    track: (...args: unknown[]) => mockTrack(...args),
    trackError: jest.fn(),
    setAnalyticsEnabled: jest.fn(),
  }),
  inferErrorDomain: () => 'ui',
  setAnalyticsEnabled: jest.fn(),
  trackAnalyticsError: jest.fn(),
  trackAnalyticsEvent: jest.fn(),
  useAnalytics: () => ({
    track: (...args: unknown[]) => mockTrack(...args),
    trackError: jest.fn(),
    setAnalyticsEnabled: jest.fn(),
  }),
}));

jest.unstable_mockModule('@/stores/layoutStore', () => ({
  applyWorkspacePreset: (...args: unknown[]) => mockApplyWorkspacePreset(...args),
}));

jest.unstable_mockModule('@/services/desktopMcp', () => ({
  buildClaudeMcpCommand: (port: number) =>
    `claude mcp add --transport http --scope user openscad-studio http://127.0.0.1:${port}/mcp`,
  buildCodexMcpCommand: (port: number) =>
    `codex mcp add openscad-studio --url http://127.0.0.1:${port}/mcp`,
  buildCursorMcpConfig: (port: number) => `{
  "mcpServers": {
    "openscad-studio": {
      "url": "http://127.0.0.1:${port}/mcp"
    }
  }
}`,
  buildOpenCodeMcpConfig: (port: number) => `{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "openscad-studio": {
      "type": "remote",
      "url": "http://127.0.0.1:${port}/mcp",
      "enabled": true
    }
  }
}`,
  getDesktopMcpStatus: (...args: unknown[]) => mockGetDesktopMcpStatus(...args),
  syncDesktopMcpConfig: (...args: unknown[]) => mockSyncDesktopMcpConfig(...args),
}));

let SettingsDialog: typeof import('../SettingsDialog').SettingsDialog;

describe('SettingsDialog privacy copy', () => {
  beforeAll(async () => {
    ({ SettingsDialog } = await import('../SettingsDialog'));
  });

  beforeEach(() => {
    localStorage.clear();
    jest.clearAllMocks();
    platformMock = {
      getLibraryPaths: jest.fn(async () => []),
      getDefaultProjectsDirectory: jest.fn(async () => '/Users/test/Documents/OpenSCAD Studio'),
      pickDirectory: jest.fn(async () => null),
      capabilities: { hasFileSystem: true },
    };
    mockGetPlatform.mockReturnValue(platformMock);
    mockGetDesktopMcpStatus.mockResolvedValue({
      enabled: true,
      port: 32123,
      status: 'running',
      endpoint: 'http://127.0.0.1:32123/mcp',
      message: null,
    });
    mockSyncDesktopMcpConfig.mockResolvedValue({
      enabled: true,
      port: 32123,
      status: 'running',
      endpoint: 'http://127.0.0.1:32123/mcp',
      message: null,
    });

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

    const toggle = screen.getByRole('switch');
    expect(toggle).toHaveAttribute('data-state', 'unchecked');
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
          showModelColors: false,
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

    const axesToggle = screen.getByLabelText('Show axes');
    const axisLabelsToggle = screen.getByLabelText('Show axis labels');
    const threeDGridToggle = screen.getByLabelText('Show 3D grid');
    const shadowsToggle = screen.getByLabelText('Show shadows');
    const modelColorsToggle = screen.getByLabelText('Show model colors');
    const viewcubeToggle = screen.getByLabelText('Show viewcube');
    const snapToggle = screen.getByLabelText('Snap 3D measurements');
    const inspectionHudToggle = screen.getByLabelText('Show inspection HUD');

    expect(axesToggle).toHaveAttribute('data-state', 'unchecked');
    expect(axisLabelsToggle).toHaveAttribute('data-state', 'unchecked');
    expect(axisLabelsToggle).toBeDisabled();
    expect(threeDGridToggle).toHaveAttribute('data-state', 'unchecked');
    expect(shadowsToggle).toHaveAttribute('data-state', 'unchecked');
    expect(modelColorsToggle).toHaveAttribute('data-state', 'unchecked');
    expect(
      screen.getByText(/turn this off to render all geometry with the theme preview material/i)
    ).toBeTruthy();
    expect(viewcubeToggle).toHaveAttribute('data-state', 'unchecked');
    expect(snapToggle).toHaveAttribute('data-state', 'unchecked');
    expect(inspectionHudToggle).toHaveAttribute('data-state', 'unchecked');

    const gridToggle = screen.getByLabelText('Show 2D grid');
    const twoDAxesToggle = screen.getByLabelText('Show 2D axes');
    expect(gridToggle).toHaveAttribute('data-state', 'unchecked');
    expect(twoDAxesToggle).toHaveAttribute('data-state', 'unchecked');
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

  it('shows external agent MCP onboarding in the AI settings tab', async () => {
    render(
      <ThemeProvider>
        <SettingsDialog isOpen onClose={() => {}} initialTab="ai" />
      </ThemeProvider>
    );

    expect(await screen.findByText('External Agents')).toBeTruthy();
    expect(screen.getByText('Enable local MCP server')).toBeTruthy();
    expect(screen.getByText('Claude Code')).toBeTruthy();
    expect(screen.getByText('Codex')).toBeTruthy();
    expect(screen.getByText('Cursor')).toBeTruthy();
    expect(screen.getByText('OpenCode')).toBeTruthy();
    expect(screen.getByText(/get_or_create_workspace/i)).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Copy' }).length).toBeGreaterThanOrEqual(5);
    expect(screen.getAllByText(/http:\/\/127\.0\.0\.1:32123\/mcp/i).length).toBeGreaterThan(0);
    expect(mockGetDesktopMcpStatus).toHaveBeenCalled();
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
    fireEvent.click(screen.getByLabelText('Show model colors'));
    fireEvent.click(screen.getByRole('button', { name: 'Project' }));
    fireEvent.click(screen.getByLabelText('Measurement Unit'));
    fireEvent.click(await screen.findByRole('option', { name: /in \(inches\)/i }));

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
    expect(mockTrack).toHaveBeenCalledWith(
      'viewer preference changed',
      expect.objectContaining({
        setting: 'show_model_colors',
        enabled: false,
      })
    );
  });
});
