/** @jest-environment jsdom */

import { act, screen } from '@testing-library/react';
import { jest } from '@jest/globals';
import { renderWithProviders } from './test-utils';

jest.unstable_mockModule('@/analytics/runtime', () => ({
  bucketCount: (value: number) => String(value),
  createAnalyticsApi: () => ({
    track: jest.fn(),
    trackError: jest.fn(),
    setAnalyticsEnabled: jest.fn(),
  }),
  useAnalytics: () => ({ track: jest.fn() }),
  inferErrorDomain: () => 'ui',
  setAnalyticsEnabled: jest.fn(),
  trackAnalyticsError: jest.fn(),
  trackAnalyticsEvent: jest.fn(),
}));

jest.unstable_mockModule('@/platform', () => ({
  getPlatform: () => ({ fileExport: jest.fn() }),
}));

jest.unstable_mockModule('@/services/exportService', () => ({
  exportModelWithContext: jest.fn(),
}));

jest.unstable_mockModule('@/utils/notifications', () => ({
  notifyError: jest.fn(),
  notifySuccess: jest.fn(),
  normalizeAppError: (_err: unknown, fallback: string) => ({ message: fallback }),
}));

let ExportDialog: typeof import('../ExportDialog').ExportDialog;

describe('ExportDialog default format', () => {
  beforeAll(async () => {
    ({ ExportDialog } = await import('../ExportDialog'));
  });

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
