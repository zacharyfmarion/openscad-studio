/** @jest-environment jsdom */

import { render, screen, waitFor } from '@testing-library/react';
import { jest } from '@jest/globals';
import { SettingsDialog } from '../SettingsDialog';
import { ThemeProvider } from '../../contexts/ThemeContext';

const mockGetPlatform = jest.fn();
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

describe('SettingsDialog privacy copy', () => {
  beforeEach(() => {
    localStorage.clear();
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
        },
      })
    );

    render(
      <ThemeProvider>
        <SettingsDialog isOpen onClose={() => {}} initialTab="viewer" />
      </ThemeProvider>
    );

    expect(await screen.findByText('Show axes')).toBeTruthy();

    const axesToggle = screen.getByLabelText('Show axes') as HTMLInputElement;
    const axisLabelsToggle = screen.getByLabelText('Show axis labels') as HTMLInputElement;

    expect(axesToggle.checked).toBe(false);
    expect(axisLabelsToggle.checked).toBe(false);
    expect(axisLabelsToggle.disabled).toBe(true);
  });
});
