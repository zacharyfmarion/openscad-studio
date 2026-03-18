/** @jest-environment jsdom */

import { act, fireEvent, render, screen } from '@testing-library/react';
import { jest } from '@jest/globals';
import { CustomizerPanel } from '../CustomizerPanel';
import type { CustomizerTab } from '../../utils/customizer/types';

const mockParseCustomizerParams = jest.fn<(code: string) => CustomizerTab[]>();
const mockIsParserReady = jest.fn(() => true);
const mockOnParserReady = jest.fn(() => () => {});
const mockEmit = jest.fn();

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

describe('CustomizerPanel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
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

    render(
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
  });

  it('shows the no-params refine state and forwards the suggested AI prompt', () => {
    const handleRefine = jest.fn();
    mockParseCustomizerParams.mockReturnValue([]);

    render(
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
  });

  it('shows a loading skeleton until the parser is ready', () => {
    mockIsParserReady.mockReturnValue(false);
    mockParseCustomizerParams.mockReturnValue([]);

    render(<CustomizerPanel code="cube(10);" baselineCode="cube(10);" onChange={() => {}} />);

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

    render(
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

    const { rerender } = render(
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

    const { rerender } = render(
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
