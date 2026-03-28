/** @jest-environment jsdom */

import { act, screen } from '@testing-library/react';
import { jest } from '@jest/globals';
import { ExportDialog } from '../ExportDialog';
import { renderWithProviders } from './test-utils';

jest.mock('../../analytics/runtime', () => ({
  useAnalytics: () => ({ track: jest.fn() }),
}));

jest.mock('../../platform', () => ({
  getPlatform: () => ({ fileExport: jest.fn() }),
}));

jest.mock('../../services/renderService', () => ({
  RenderService: { getInstance: () => ({ exportModel: jest.fn() }) },
}));

jest.mock('../../utils/notifications', () => ({
  notifyError: jest.fn(),
  notifySuccess: jest.fn(),
  normalizeAppError: (_err: unknown, fallback: string) => ({ message: fallback }),
}));

describe('ExportDialog default format', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('defaults to STL for 3D designs', () => {
    renderWithProviders(<ExportDialog isOpen onClose={() => {}} source="" />);
    const trigger = screen.getByTestId('export-format-select');
    expect(trigger.textContent).toContain('STL');
  });

  it('defaults to SVG for 2D designs', () => {
    renderWithProviders(<ExportDialog isOpen onClose={() => {}} source="" previewKind="svg" />);
    const trigger = screen.getByTestId('export-format-select');
    expect(trigger.textContent).toContain('SVG');
  });

  it('defaults to SVG when dialog opens for the first time with a 2D design', async () => {
    // Simulate the real-world case: component mounts closed (isOpen=false),
    // then opens later with previewKind="svg". The useState initializer runs at
    // mount time (when isOpen is false), so the useEffect is what actually resets
    // the format when the dialog opens.
    const { rerender } = renderWithProviders(
      <ExportDialog isOpen={false} onClose={() => {}} source="" previewKind="svg" />
    );

    await act(async () => {
      rerender(<ExportDialog isOpen onClose={() => {}} source="" previewKind="svg" />);
    });

    const trigger = screen.getByTestId('export-format-select');
    expect(trigger.textContent).toContain('SVG');
  });
});
