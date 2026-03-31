/** @jest-environment jsdom */

import { screen } from '@testing-library/react';
import { ParameterControl } from '../customizer/ParameterControl';
import type { CustomizerParam } from '../../utils/customizer/types';
import { updateSetting } from '../../stores/settingsStore';
import { renderWithProviders } from './test-utils';

function makeParam(overrides: Partial<CustomizerParam> = {}): CustomizerParam {
  return {
    name: 'pot_height',
    type: 'number',
    value: 80,
    rawValue: '80',
    line: 1,
    ...overrides,
  };
}

describe('ParameterControl', () => {
  beforeEach(() => {
    localStorage.clear();
    updateSetting('viewer', { measurementUnit: 'mm' });
  });

  it('uses the compact inline layout for unannotated simple controls', () => {
    renderWithProviders(<ParameterControl param={makeParam()} onChange={() => {}} />);

    const control = screen.getByTestId('customizer-control-pot_height');
    const input = control.querySelector('[data-slot="inline-meta"] input');
    const inputShell = input?.closest('.w-24');

    expect(control.getAttribute('data-layout')).toBe('inline');
    expect(input).toBeTruthy();
    expect(input?.className).toContain('px-2.5');
    expect(input?.className).toContain('py-1.5');
    expect(input?.className).toContain('text-right');
    expect(inputShell).toBeTruthy();
    expect(control.querySelector('[data-slot="control-body"] input')).toBeNull();
    expect(screen.getByText('mm')).toBeTruthy();
  });

  it('uses the project measurement unit as a fallback for numeric controls', () => {
    updateSetting('viewer', { measurementUnit: 'cm' });

    renderWithProviders(<ParameterControl param={makeParam()} onChange={() => {}} />);

    expect(screen.getByText('cm')).toBeTruthy();
  });

  it('keeps hybrid annotated controls in the stacked layout', () => {
    renderWithProviders(
      <ParameterControl param={makeParam({ source: 'hybrid' })} onChange={() => {}} />
    );

    expect(screen.getByTestId('customizer-control-pot_height').getAttribute('data-layout')).toBe(
      'stacked'
    );
  });

  it('keeps unannotated sliders in the stacked layout', () => {
    renderWithProviders(
      <ParameterControl
        param={makeParam({
          type: 'slider',
          min: 40,
          max: 120,
          step: 1,
        })}
        onChange={() => {}}
      />
    );

    expect(screen.getByTestId('customizer-control-pot_height').getAttribute('data-layout')).toBe(
      'stacked'
    );
  });

  it('keeps controls with descriptions in the stacked layout', () => {
    renderWithProviders(
      <ParameterControl
        param={makeParam({ description: 'Overall height in millimeters' })}
        onChange={() => {}}
      />
    );

    expect(screen.getByTestId('customizer-control-pot_height').getAttribute('data-layout')).toBe(
      'stacked'
    );
    expect(screen.getByText('Overall height in millimeters')).toBeTruthy();
  });
});
