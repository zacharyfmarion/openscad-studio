/** @jest-environment jsdom */

import { fireEvent, screen } from '@testing-library/react';
import { jest } from '@jest/globals';
import { renderWithProviders } from './test-utils';
import { WebMenuBar } from '../WebMenuBar';

describe('WebMenuBar help menu', () => {
  it('opens the shortcuts dialog callback from Help', () => {
    const onShowShortcuts = jest.fn();

    renderWithProviders(
      <WebMenuBar onExport={() => {}} onShowShortcuts={onShowShortcuts} onShowAbout={() => {}} />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Help' }));
    fireEvent.click(screen.getByRole('button', { name: /Keyboard Shortcuts/ }));

    expect(onShowShortcuts).toHaveBeenCalledTimes(1);
  });

  it('opens the about dialog callback from Help', () => {
    const onShowAbout = jest.fn();

    renderWithProviders(
      <WebMenuBar onExport={() => {}} onShowShortcuts={() => {}} onShowAbout={onShowAbout} />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Help' }));
    fireEvent.click(screen.getByRole('button', { name: 'About OpenSCAD Studio' }));

    expect(onShowAbout).toHaveBeenCalledTimes(1);
  });
});
