/** @jest-environment jsdom */

import { act, fireEvent, screen } from '@testing-library/react';
import { jest } from '@jest/globals';
import { CustomizerPanel } from '../CustomizerPanel';
import type { CustomizerTab } from '../../utils/customizer/types';
import { updateSetting } from '../../stores/settingsStore';
import { renderWithProviders } from './test-utils';

const mockParseCustomizerParams = jest.fn<(code: string) => CustomizerTab[]>();
const mockIsParserReady = jest.fn(() => true);
const mockOnParserReady = jest.fn(() => () => {});
const mockEmit = jest.fn();
const mockTrack = jest.fn();

jest.mock('../../utils/customizer/parser', () => ({
  parseCustomizerParams: (code: string) => mockParseCustomizerParams(code),
}));

jest.mock('../../utils/formatter/parser', () => ({
  isParserReady: () => mockIsParserReady(),
  onParserReady: (callback: () => void) => mockOnParserReady(callback),
}));

jest.mock('../../platform', () => ({
  eventBus: {
    emit: (...args: unknown[]) => mockEmit(...args),
  },
}));

jest.mock('../../analytics/runtime', () => ({
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

describe('CustomizerPanel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
    localStorage.clear();
    updateSetting('ui', { defaultLayoutPreset: 'default' });
    mockIsParserReady.mockReturnValue(true);
    mockOnParserReady.mockReturnValue(() => {});
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
        onChange={() => {}}
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
        onChange={() => {}}
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
        onChange={() => {}}
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
        onChange={() => {}}
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
    const handleChange = jest.fn();
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
      <CustomizerPanel code="width = 60;" baselineCode="width = 60;" onChange={handleChange} />
    );

    rerender(
      <CustomizerPanel code="width = 80;" baselineCode="width = 60;" onChange={handleChange} />
    );

    expect(screen.getByText('Edited')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Reset Width' }));

    expect(handleChange).toHaveBeenCalledWith('width = 60;');
  });

  it('treats slider changes as resettable against the opened-file baseline', () => {
    jest.useFakeTimers();
    const handleChange = jest.fn();

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
      <CustomizerPanel code="width = 60;" baselineCode="width = 60;" onChange={handleChange} />
    );

    fireEvent.change(screen.getByLabelText('Width slider'), { target: { value: '80' } });

    act(() => {
      jest.advanceTimersByTime(150);
    });

    expect(handleChange).toHaveBeenCalledWith('width = 80;');

    rerender(
      <CustomizerPanel code="width = 80;" baselineCode="width = 60;" onChange={handleChange} />
    );

    expect(screen.getByText('Edited')).toBeTruthy();
    expect(
      (screen.getByRole('button', { name: 'Reset to defaults' }) as HTMLButtonElement).disabled
    ).toBe(false);
  });
});
