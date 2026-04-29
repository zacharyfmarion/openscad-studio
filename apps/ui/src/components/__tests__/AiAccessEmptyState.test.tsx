/** @jest-environment jsdom */

import { fireEvent, screen, waitFor } from '@testing-library/react';
import { jest } from '@jest/globals';
import { renderWithProviders } from './test-utils';

const mockTrack = jest.fn();
const mockGetPlatform = jest.fn();

jest.unstable_mockModule('@/analytics/runtime', () => ({
  bucketCount: (value: number) => String(value),
  createAnalyticsApi: () => ({
    track: mockTrack,
    trackError: jest.fn(),
    setAnalyticsEnabled: jest.fn(),
  }),
  inferErrorDomain: () => 'ui',
  trackAnalyticsError: jest.fn(),
  trackAnalyticsEvent: jest.fn(),
  useAnalytics: () => ({
    track: mockTrack,
    trackError: jest.fn(),
    setAnalyticsEnabled: jest.fn(),
  }),
}));

jest.unstable_mockModule('@/platform', () => ({
  getPlatform: () => mockGetPlatform(),
}));

let AiAccessEmptyState: typeof import('../AiAccessEmptyState').AiAccessEmptyState;

describe('AiAccessEmptyState', () => {
  beforeAll(async () => {
    ({ AiAccessEmptyState } = await import('../AiAccessEmptyState'));
  });

  beforeEach(() => {
    localStorage.clear();
    mockTrack.mockClear();
    mockGetPlatform.mockReturnValue({
      capabilities: { hasFileSystem: true },
    });
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('selects Claude Code by default and switches setup tabs in the panel variant', async () => {
    renderWithProviders(
      <AiAccessEmptyState
        variant="panel"
        onOpenSettings={() => {}}
        panelLayout="stacked"
        showMacAppUpsell
      />
    );

    expect(screen.getByText('Set up AI access')).toBeTruthy();
    expect(screen.getByRole('tab', { name: /Claude Code/i })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    expect(screen.getByText(/claude mcp add --transport http --scope user/i)).toBeTruthy();
    expect(screen.getByText(/register the app as an MCP server\./i)).toBeTruthy();
    expect(screen.queryByText(/codex mcp add openscad-studio --url/i)).toBeNull();

    const cursorTab = screen.getByRole('tab', { name: /Cursor/i });
    fireEvent.mouseDown(cursorTab, { button: 0, ctrlKey: false });

    await waitFor(() => {
      expect(cursorTab).toHaveAttribute('aria-selected', 'true');
    });
    expect(screen.getAllByText(/~\/\.cursor\/mcp\.json/i).length).toBeGreaterThan(0);
  });

  it('renders a split layout when panelLayout is split', async () => {
    renderWithProviders(
      <AiAccessEmptyState variant="panel" onOpenSettings={() => {}} panelLayout="split" />
    );

    await waitFor(() => {
      expect(screen.getByRole('tablist')).toHaveAttribute('aria-orientation', 'vertical');
    });

    expect(screen.getByRole('tab', { name: /Claude Code/i })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    expect(screen.getByText('Built-in AI')).toBeTruthy();
    expect(screen.getByText('Desktop agent setup')).toBeTruthy();
    expect(screen.getByText(/register the app as an MCP server\./i)).toBeTruthy();
  });

  it('shows a Mac app download upsell on the web panel empty state and tracks engagement', async () => {
    const handleOpenSettings = jest.fn();
    mockGetPlatform.mockReturnValue({
      capabilities: { hasFileSystem: false },
    });

    renderWithProviders(
      <AiAccessEmptyState
        variant="panel"
        onOpenSettings={handleOpenSettings}
        panelLayout="stacked"
        showMacAppUpsell
      />
    );

    expect(screen.getByText('AI setup')).toBeTruthy();
    expect(screen.getByText('Connect an AI assistant')).toBeTruthy();
    expect(screen.getByText('Use an API key')).toBeTruthy();
    expect(screen.getByText('Use a desktop agent')).toBeTruthy();
    expect(screen.getByText(/already use Claude Code, Codex, Cursor/i)).toBeTruthy();
    expect(screen.queryByRole('tablist')).toBeNull();

    await waitFor(() => {
      expect(mockTrack).toHaveBeenCalledWith('ai setup nux viewed', {
        source_surface: 'ai_panel',
        options: ['built_in_api_key', 'mac_app_mcp'],
      });
      expect(mockTrack).toHaveBeenCalledWith('ai panel mac app upsell viewed', {
        source_surface: 'ai_panel',
        panel_layout: 'stacked',
      });
    });

    fireEvent.click(screen.getByRole('button', { name: /add api key/i }));

    expect(handleOpenSettings).toHaveBeenCalledTimes(1);
    expect(mockTrack).toHaveBeenCalledWith('ai setup option clicked', {
      source_surface: 'ai_panel',
      option: 'built_in_api_key',
    });

    const downloadLink = screen.getByRole('link', { name: /download mac app/i });
    expect(downloadLink).toHaveAttribute(
      'href',
      expect.stringContaining('OpenSCAD.Studio_latest_aarch64.dmg')
    );

    fireEvent.click(downloadLink);

    expect(mockTrack).toHaveBeenCalledWith('ai setup option clicked', {
      source_surface: 'ai_panel',
      option: 'mac_app_mcp',
      destination: 'mac_app_download',
    });
    expect(mockTrack).toHaveBeenCalledWith('ai panel mac app upsell clicked', {
      source_surface: 'ai_panel',
      panel_layout: 'stacked',
      destination: 'mac_app_download',
    });
  });

  it('does not show the Mac app upsell unless the caller opts into the no-key prompt', () => {
    mockGetPlatform.mockReturnValue({
      capabilities: { hasFileSystem: false },
    });

    renderWithProviders(
      <AiAccessEmptyState variant="panel" onOpenSettings={() => {}} panelLayout="stacked" />
    );

    expect(screen.queryByTestId('ai-mac-app-upsell')).toBeNull();
    expect(screen.queryByRole('tablist')).toBeTruthy();
    expect(mockTrack).not.toHaveBeenCalledWith('ai panel mac app upsell viewed', expect.anything());
  });
});
