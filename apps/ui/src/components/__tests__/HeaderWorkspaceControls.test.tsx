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
      />
    );

    const editButton = screen.getByRole('button', { name: 'Edit' });

    expect(editButton.getAttribute('aria-pressed')).toBe('true');
    expect(editButton.style.height).toBe('26px');

    fireEvent.click(screen.getByRole('button', { name: 'AI' }));
    fireEvent.click(screen.getByRole('button', { name: 'Customize' }));

    expect(handleLayoutPresetChange).toHaveBeenNthCalledWith(1, 'ai-first');
    expect(handleLayoutPresetChange).toHaveBeenNthCalledWith(2, 'customizer-first');
  });
});
