/** @jest-environment jsdom */

import { act, fireEvent, screen } from '@testing-library/react';
import { jest } from '@jest/globals';
import type { CustomizerTab } from '../../utils/customizer/types';
import { updateSetting } from '../../stores/settingsStore';
import { renderWithProviders } from './test-utils';

const mockParseCustomizerParams = jest.fn<(code: string) => CustomizerTab[]>();
const mockIsParserReady = jest.fn(() => true);
const mockOnParserReady = jest.fn(() => () => {});
const mockEmit = jest.fn();
const mockTrack = jest.fn();
let mockElementWidth = 960;

jest.unstable_mockModule('@/utils/customizer/parser', () => ({
  parseCustomizerParams: (code: string) => mockParseCustomizerParams(code),
}));

jest.unstable_mockModule('@/utils/formatter/parser', () => ({
  isParserReady: () => mockIsParserReady(),
  onParserReady: (callback: () => void) => mockOnParserReady(callback),
}));

jest.unstable_mockModule('@/platform', () => ({
  eventBus: {
    emit: (...args: unknown[]) => mockEmit(...args),
  },
}));

jest.unstable_mockModule('@/analytics/runtime', () => ({
  createAnalyticsApi: () => ({
    track: (...args: unknown[]) => mockTrack(...args),
    trackError: jest.fn(),
    setAnalyticsEnabled: jest.fn(),
  }),
  inferErrorDomain: () => 'ui',
  setAnalyticsEnabled: jest.fn(),
  trackAnalyticsError: jest.fn(),
  trackAnalyticsEvent: jest.fn(),
  useAnalytics: () => ({
    track: (...args: unknown[]) => mockTrack(...args),
    trackError: jest.fn(),
    setAnalyticsEnabled: jest.fn(),
  }),
  bucketCount: (value: number, thresholds: number[]) => {
    for (const threshold of thresholds) {
      if (value <= threshold) {
        return `<=${threshold}`;
      }
    }
    return `>${thresholds[thresholds.length - 1]}`;
  },
}));

let CustomizerPanel: typeof import('../CustomizerPanel').CustomizerPanel;

describe('CustomizerPanel', () => {
  beforeAll(async () => {
    ({ CustomizerPanel } = await import('../CustomizerPanel'));
  });

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
    localStorage.clear();
    mockElementWidth = 960;
    updateSetting('ui', { defaultLayoutPreset: 'default' });
    mockIsParserReady.mockReturnValue(true);
    mockOnParserReady.mockReturnValue(() => {});

    class ResizeObserverMock {
      observe() {}
      disconnect() {}
      unobserve() {}
    }

    Object.defineProperty(global, 'ResizeObserver', {
      writable: true,
      value: ResizeObserverMock,
    });

    Object.defineProperty(HTMLElement.prototype, 'getBoundingClientRect', {
      configurable: true,
      value: jest.fn(() => ({
        x: 0,
        y: 0,
        left: 0,
        top: 0,
        right: mockElementWidth,
        bottom: 80,
        width: mockElementWidth,
        height: 80,
        toJSON: () => ({}),
      })),
    });
  });

  it('renders grouped polished controls and hides advanced params by default', () => {
    mockParseCustomizerParams.mockReturnValue([
      {
        name: 'Dimensions',
        params: [
          {
            name: 'width',
            type: 'slider',
            value: 60,
            rawValue: '60',
            min: 40,
            max: 120,
            step: 1,
            line: 2,
            tab: 'Dimensions',
            group: 'Body',
            label: 'Width',
            description: 'Overall width in millimeters',
            unit: 'mm',
            prominence: 'primary',
          },
          {
            name: 'tolerance',
            type: 'number',
            value: 0.3,
            rawValue: '0.3',
            line: 3,
            tab: 'Dimensions',
            group: 'Advanced',
            label: 'Tolerance',
            prominence: 'advanced',
          },
        ],
      },
    ]);

    renderWithProviders(
      <CustomizerPanel
        code="width = 60;"
        baselineCode="width = 60;"
        isCustomizerFirstMode
        previewKind="mesh"
        previewAvailable
        renderReady
        onRefineWithAi={() => {}}
        onEditCode={() => {}}
        onDownloadStl={() => {}}
      />
    );

    expect(screen.getByText('Customize')).toBeTruthy();
    expect(screen.getByText('Body')).toBeTruthy();
    expect(screen.getByText('Width')).toBeTruthy();
    expect(screen.getByText('Overall width in millimeters')).toBeTruthy();
    expect(screen.getAllByText('mm').length).toBeGreaterThan(0);
    expect(screen.queryByText('Tolerance')).toBeNull();

    fireEvent.click(screen.getByLabelText('Show advanced controls'));

    expect(screen.getAllByText('Advanced').length).toBeGreaterThan(0);
    expect(screen.getByText('Tolerance')).toBeTruthy();
    expect(mockTrack).toHaveBeenCalledWith(
      'customizer rendered',
      expect.objectContaining({
        layout_preset: 'default',
        parameter_count_bucket: '<=3',
        group_count_bucket: '<=2',
        has_studio_metadata: false,
        has_advanced_parameters: true,
      })
    );
  });

  it('shows the no-params refine state and forwards the suggested AI prompt', () => {
    const handleRefine = jest.fn();
    mockParseCustomizerParams.mockReturnValue([]);

    renderWithProviders(
      <CustomizerPanel
        code="cube(10);"
        baselineCode="cube(10);"
        onRefineWithAi={handleRefine}
        onEditCode={() => {}}
      />
    );

    expect(screen.getByText('No parameters yet')).toBeTruthy();
    fireEvent.click(screen.getByTestId('customizer-refine-button'));

    expect(handleRefine).toHaveBeenCalled();
    expect(mockTrack).toHaveBeenCalledWith(
      'customizer action clicked',
      expect.objectContaining({
        action: 'open_ai_refine',
        layout_preset: 'default',
        has_studio_metadata: false,
        parameter_count_bucket: '<=0',
      })
    );
  });

  it('shows a loading skeleton until the parser is ready', () => {
    mockIsParserReady.mockReturnValue(false);
    mockParseCustomizerParams.mockReturnValue([]);

    renderWithProviders(
      <CustomizerPanel code="cube(10);" baselineCode="cube(10);" onChange={() => {}} />
    );

    expect(screen.getByLabelText('Loading customizer')).toBeTruthy();
    expect(screen.queryByText('This model is not customizable yet')).toBeNull();
  });

  it('disables Download STL when rendering is unavailable', () => {
    mockParseCustomizerParams.mockReturnValue([
      {
        name: 'Parameters',
        params: [
          {
            name: 'width',
            type: 'number',
            value: 10,
            rawValue: '10',
            line: 1,
            tab: 'Parameters',
          },
        ],
      },
    ]);

    renderWithProviders(
      <CustomizerPanel
        code="width = 10;"
        baselineCode="width = 10;"
        isCustomizerFirstMode
        previewKind="svg"
        previewAvailable
        renderReady
        onDownloadSvg={() => {}}
      />
    );

    expect((screen.getByTestId('customizer-download-button') as HTMLButtonElement).disabled).toBe(
      false
    );
  });

  it('switches customizer-first header actions to icon buttons when the panel is narrow', () => {
    mockElementWidth = 400;
    mockParseCustomizerParams.mockReturnValue([
      {
        name: 'Parameters',
        params: [
          {
            name: 'width',
            type: 'number',
            value: 10,
            rawValue: '10',
            line: 1,
            tab: 'Parameters',
          },
        ],
      },
    ]);

    renderWithProviders(
      <CustomizerPanel
        code="width = 10;"
        baselineCode="width = 8;"
        isCustomizerFirstMode
        previewKind="mesh"
        previewAvailable
        renderReady
        onRefineWithAi={() => {}}
        onDownloadStl={() => {}}
      />
    );

    expect(screen.queryByText('Refine')).toBeNull();
    expect(screen.queryByText('Download STL')).toBeNull();
    expect(screen.queryByText('Reset')).toBeNull();
    expect(screen.getByRole('button', { name: 'Refine with AI' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Download STL' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Reset to defaults' })).toBeTruthy();
  });

  it('tracks customizer render and export actions with bounded properties', () => {
    const handleDownloadSvg = jest.fn();
    mockParseCustomizerParams.mockReturnValue([
      {
        name: 'Dimensions',
        params: [
          {
            name: 'width',
            type: 'slider',
            value: 60,
            rawValue: '60',
            min: 40,
            max: 120,
            step: 1,
            line: 2,
            tab: 'Dimensions',
            group: 'Body',
            label: 'Width',
            prominence: 'primary',
            source: 'hybrid',
          },
          {
            name: 'height',
            type: 'number',
            value: 30,
            rawValue: '30',
            line: 3,
            tab: 'Dimensions',
            group: 'Body',
            source: 'standard',
          },
        ],
      },
    ]);

    updateSetting('ui', { defaultLayoutPreset: 'customizer-first' });

    renderWithProviders(
      <CustomizerPanel
        code="width = 60;\nheight = 30;"
        baselineCode="width = 60;\nheight = 30;"
        isCustomizerFirstMode
        previewKind="svg"
        previewAvailable
        renderReady
        onDownloadSvg={handleDownloadSvg}
      />
    );

    fireEvent.click(screen.getByTestId('customizer-download-button'));

    expect(mockTrack).toHaveBeenCalledWith(
      'customizer rendered',
      expect.objectContaining({
        layout_preset: 'customizer-first',
        parameter_count_bucket: '<=3',
        group_count_bucket: '<=1',
        has_studio_metadata: true,
        has_advanced_parameters: false,
      })
    );
    expect(mockTrack).toHaveBeenCalledWith(
      'customizer action clicked',
      expect.objectContaining({
        action: 'open_export',
        layout_preset: 'customizer-first',
        has_studio_metadata: true,
        parameter_count_bucket: '<=3',
      })
    );
    expect(handleDownloadSvg).toHaveBeenCalled();
  });

  it('marks overridden fields and supports resetting a single parameter', () => {
    mockParseCustomizerParams.mockImplementation((code: string) => [
      {
        name: 'Parameters',
        params: [
          {
            name: 'width',
            type: 'number',
            value: code.includes('80') ? 80 : 60,
            rawValue: code.includes('80') ? '80' : '60',
            line: 1,
            tab: 'Parameters',
            label: 'Width',
          },
        ],
      },
    ]);

    const { rerender } = renderWithProviders(
      <CustomizerPanel code="width = 60;" baselineCode="width = 60;" />
    );

    rerender(<CustomizerPanel code="width = 80;" baselineCode="width = 60;" />);

    expect(screen.getByText('Edited')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Reset Width' }));

    expect(mockEmit).toHaveBeenCalledWith('code-updated', {
      code: 'width = 60;',
      source: 'customizer',
    });
  });

  it('renders textarea-backed string params for large text fields', () => {
    mockParseCustomizerParams.mockReturnValue([
      {
        name: 'Parameters',
        params: [
          {
            name: 'engraving',
            type: 'string',
            value: 'Line 1\nLine 2',
            rawValue: '"Line 1\\nLine 2"',
            line: 1,
            tab: 'Parameters',
            label: 'Engraving',
            input: 'textarea',
            rows: 5,
            source: 'hybrid',
          },
        ],
      },
    ]);

    renderWithProviders(
      <CustomizerPanel
        code='engraving = "Line 1\\nLine 2";'
        baselineCode='engraving = "Line 1\\nLine 2";'
      />
    );

    const textarea = screen.getByLabelText('Engraving') as HTMLTextAreaElement;
    expect(textarea.tagName).toBe('TEXTAREA');
    expect(textarea.rows).toBe(5);
    expect(textarea.value).toBe('Line 1\nLine 2');
  });

  it('escapes textarea edits before writing them back to code', () => {
    mockParseCustomizerParams.mockReturnValue([
      {
        name: 'Parameters',
        params: [
          {
            name: 'engraving',
            type: 'string',
            value: 'Line 1\nLine 2',
            rawValue: '"Line 1\\nLine 2"',
            line: 1,
            tab: 'Parameters',
            label: 'Engraving',
            input: 'textarea',
            rows: 5,
          },
        ],
      },
    ]);

    renderWithProviders(
      <CustomizerPanel
        code='engraving = "Line 1\\nLine 2";'
        baselineCode='engraving = "Line 1\\nLine 2";'
      />
    );

    const textarea = screen.getByLabelText('Engraving');
    fireEvent.change(textarea, { target: { value: 'Line 1\n"Quoted"' } });
    fireEvent.blur(textarea);

    expect(mockEmit).toHaveBeenCalledWith('code-updated', {
      code: 'engraving = "Line 1\\n\\"Quoted\\"";',
      source: 'customizer',
    });
  });

  it('treats slider changes as resettable against the opened-file baseline', () => {
    jest.useFakeTimers();

    mockParseCustomizerParams.mockImplementation((code: string) => [
      {
        name: 'Parameters',
        params: [
          {
            name: 'width',
            type: 'slider',
            value: code.includes('80') ? 80 : 60,
            rawValue: code.includes('80') ? '80' : '60',
            min: 40,
            max: 120,
            step: 1,
            line: 1,
            tab: 'Parameters',
            label: 'Width',
          },
        ],
      },
    ]);

    const { rerender } = renderWithProviders(
      <CustomizerPanel code="width = 60;" baselineCode="width = 60;" />
    );

    fireEvent.change(screen.getByLabelText('Width slider'), { target: { value: '80' } });

    act(() => {
      jest.advanceTimersByTime(150);
    });

    expect(mockEmit).toHaveBeenCalledWith('code-updated', {
      code: 'width = 80;',
      source: 'customizer',
    });

    rerender(<CustomizerPanel code="width = 80;" baselineCode="width = 60;" />);

    expect(screen.getByText('Edited')).toBeTruthy();
    expect(
      (screen.getByRole('button', { name: 'Reset to defaults' }) as HTMLButtonElement).disabled
    ).toBe(false);
  });
});
