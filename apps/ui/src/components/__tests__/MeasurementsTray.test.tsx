/** @jest-environment jsdom */

import { fireEvent, render, screen } from '@testing-library/react';
import { jest } from '@jest/globals';
import { MeasurementsTray } from '../viewer-measurements/MeasurementsTray';

describe('MeasurementsTray', () => {
  it('renders items and forwards select, delete, and clear actions', () => {
    const onSelect = jest.fn();
    const onDelete = jest.fn();
    const onClearAll = jest.fn();

    render(
      <MeasurementsTray
        items={[
          {
            id: 'm1',
            title: '0001',
            summary: 'Distance 10 units',
            detail: 'dx 10',
            selected: false,
          },
          {
            id: 'm2',
            title: '0002',
            summary: 'Distance 20 units',
            selected: true,
          },
        ]}
        containerTestId="tray"
        clearAllTestId="clear-all"
        itemTestId="item"
        deleteTestId="delete"
        onSelect={onSelect}
        onDelete={onDelete}
        onClearAll={onClearAll}
      />
    );

    fireEvent.click(screen.getAllByTestId('item')[1]);
    fireEvent.click(screen.getAllByTestId('delete')[0]);
    fireEvent.click(screen.getByTestId('clear-all'));

    expect(onSelect).toHaveBeenCalledWith('m2');
    expect(onDelete).toHaveBeenCalledWith('m1');
    expect(onClearAll).toHaveBeenCalled();
  });
});
