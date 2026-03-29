/** @jest-environment jsdom */

import { fireEvent, screen } from '@testing-library/react';
import { jest } from '@jest/globals';
import { HeaderWorkspaceControls } from '../HeaderWorkspaceControls';
import { renderWithProviders } from './test-utils';

describe('HeaderWorkspaceControls', () => {
  it('maps compact layout buttons to workspace presets', () => {
    const handleLayoutPresetChange = jest.fn();

    renderWithProviders(
      <HeaderWorkspaceControls
        layoutPreset="default"
        onLayoutPresetChange={handleLayoutPresetChange}
        downloadUrl="https://example.com/OpenSCAD.Studio_latest_aarch64.dmg"
      />
    );

    expect(screen.getByRole('button', { name: 'Edit' }).getAttribute('aria-pressed')).toBe('true');

    fireEvent.click(screen.getByRole('button', { name: 'AI' }));
    fireEvent.click(screen.getByRole('button', { name: 'Customize' }));

    expect(handleLayoutPresetChange).toHaveBeenNthCalledWith(1, 'ai-first');
    expect(handleLayoutPresetChange).toHaveBeenNthCalledWith(2, 'customizer-first');
  });

  it('renders the Mac download action as an icon link with tooltip copy', () => {
    renderWithProviders(
      <HeaderWorkspaceControls
        layoutPreset="ai-first"
        onLayoutPresetChange={() => {}}
        downloadUrl="https://example.com/OpenSCAD.Studio_latest_x64.dmg"
      />
    );

    const downloadLink = screen.getByRole('link', { name: 'Download for Mac' });

    expect(downloadLink.getAttribute('href')).toBe(
      'https://example.com/OpenSCAD.Studio_latest_x64.dmg'
    );
    expect(downloadLink.getAttribute('title')).toBe('Download for Mac');
  });
});
