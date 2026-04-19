/** @jest-environment jsdom */

import { fireEvent, screen } from '@testing-library/react';
import { jest } from '@jest/globals';
import { renderWithProviders } from './test-utils';
import { KeyboardShortcutsDialog } from '../KeyboardShortcutsDialog';

describe('KeyboardShortcutsDialog', () => {
  it('renders grouped shortcut content from the shared registry', () => {
    renderWithProviders(<KeyboardShortcutsDialog isOpen onClose={() => {}} />);

    expect(screen.getByRole('dialog', { name: 'Keyboard Shortcuts' })).toBeInTheDocument();
    expect(screen.getByText('File')).toBeInTheDocument();
    expect(screen.getByText('AI Assistant')).toBeInTheDocument();
    expect(screen.getByText('Show Keyboard Shortcuts')).toBeInTheDocument();
    expect(screen.getByText('Focus AI Assistant')).toBeInTheDocument();
  });

  it('closes when escape is pressed', () => {
    const onClose = jest.fn();

    renderWithProviders(<KeyboardShortcutsDialog isOpen onClose={onClose} />);
    fireEvent.keyDown(window, { key: 'Escape' });

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
