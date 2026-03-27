/** @jest-environment jsdom */

import { render, screen } from '@testing-library/react';
import { jest } from '@jest/globals';
import { ExportDialog } from '../ExportDialog';

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
    render(<ExportDialog isOpen onClose={() => {}} source="" />);
    const trigger = screen.getByTestId('export-format-select');
    expect(trigger.textContent).toContain('STL (3D Model)');
  });

  it('defaults to SVG for 2D designs', () => {
    render(<ExportDialog isOpen onClose={() => {}} source="" previewKind="svg" />);
    const trigger = screen.getByTestId('export-format-select');
    expect(trigger.textContent).toContain('SVG (2D Vector)');
  });
});
