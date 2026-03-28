/**
 * Shared test utilities. This file is excluded from test discovery
 * (see testPathIgnorePatterns in jest.config.cjs) so it can be
 * imported by tests without being run as a suite itself.
 */

import { render, type RenderOptions } from '@testing-library/react';
import { createElement, type ReactElement } from 'react';
import { ThemeProvider } from '../../contexts/ThemeContext';

/**
 * Render with ThemeProvider (which includes TooltipProvider).
 * Use this instead of bare `render()` for any component that
 * renders UI primitives requiring Radix context providers.
 */
export function renderWithProviders(ui: ReactElement, options?: Omit<RenderOptions, 'wrapper'>) {
  return render(ui, {
    wrapper: ({ children }) => createElement(ThemeProvider, null, children),
    ...options,
  });
}
