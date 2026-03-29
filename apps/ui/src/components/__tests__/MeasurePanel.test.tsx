/** @jest-environment jsdom */

import { jest } from '@jest/globals';
import { render, screen, fireEvent } from '@testing-library/react';
import * as THREE from 'three';
import { MeasurePanel } from '../three-viewer/panels/MeasurePanel';
import type { MeasurementRecord3D, MeasurementDraft3D } from '../three-viewer/types';

function makeMeasurement(id: string, distance = 10): MeasurementRecord3D {
  return {
    id,
    start: new THREE.Vector3(0, 0, 0),
    end: new THREE.Vector3(distance, 0, 0),
    delta: new THREE.Vector3(distance, 0, 0),
    distance,
    createdAt: Date.now(),
  };
}

const idleDraft: MeasurementDraft3D = {
  status: 'placing-start',
  start: null,
  current: null,
  snapKind: null,
  axisLock: null,
};

const noop = () => {};
const emptyProps = {
  loadedModel: null,
  sectionState: null,
  selection: { objectUuid: null, point: null, normal: null, bounds: null },
  onSectionStateChange: noop,
  onSectionReset: noop,
};

describe('MeasurePanel', () => {
  it('shows "placing-start" help text when awaiting first point', () => {
    render(
      <MeasurePanel
        {...emptyProps}
        draftMeasurement={idleDraft}
        measurements={[]}
        selectedMeasurementId={null}
        onMeasurementSelect={noop}
        onMeasurementDelete={noop}
        onMeasurementsClear={noop}
      />
    );
    expect(screen.getByText(/click to place start point/i)).toBeInTheDocument();
  });

  it('shows "placing-end" help text when awaiting second point', () => {
    render(
      <MeasurePanel
        {...emptyProps}
        draftMeasurement={{ ...idleDraft, status: 'placing-end' }}
        measurements={[]}
        selectedMeasurementId={null}
        onMeasurementSelect={noop}
        onMeasurementDelete={noop}
        onMeasurementsClear={noop}
      />
    );
    expect(screen.getByText(/click to finish/i)).toBeInTheDocument();
  });

  it('renders nothing extra when there are no measurements', () => {
    render(
      <MeasurePanel
        {...emptyProps}
        draftMeasurement={idleDraft}
        measurements={[]}
        selectedMeasurementId={null}
        onMeasurementSelect={noop}
        onMeasurementDelete={noop}
        onMeasurementsClear={noop}
      />
    );
    expect(screen.queryByTestId('preview-3d-measurements-tray')).not.toBeInTheDocument();
    expect(screen.queryByTestId('preview-3d-clear-measurements')).not.toBeInTheDocument();
  });

  it('renders measurement chips and clear button when measurements exist', () => {
    render(
      <MeasurePanel
        {...emptyProps}
        draftMeasurement={idleDraft}
        measurements={[makeMeasurement('m1', 5), makeMeasurement('m2', 10)]}
        selectedMeasurementId={null}
        onMeasurementSelect={noop}
        onMeasurementDelete={noop}
        onMeasurementsClear={noop}
      />
    );
    expect(screen.getAllByTestId('preview-3d-measurement-list-item')).toHaveLength(2);
    expect(screen.getByTestId('preview-3d-clear-measurements')).toBeInTheDocument();
  });

  it('calls onMeasurementSelect when chip clicked', () => {
    const onSelect = jest.fn();
    render(
      <MeasurePanel
        {...emptyProps}
        draftMeasurement={idleDraft}
        measurements={[makeMeasurement('m1')]}
        selectedMeasurementId={null}
        onMeasurementSelect={onSelect}
        onMeasurementDelete={noop}
        onMeasurementsClear={noop}
      />
    );
    fireEvent.click(screen.getByTestId('preview-3d-measurement-list-item'));
    expect(onSelect).toHaveBeenCalledWith('m1');
  });

  it('calls onMeasurementDelete when delete button clicked', () => {
    const onDelete = jest.fn();
    render(
      <MeasurePanel
        {...emptyProps}
        draftMeasurement={idleDraft}
        measurements={[makeMeasurement('m1')]}
        selectedMeasurementId={null}
        onMeasurementSelect={noop}
        onMeasurementDelete={onDelete}
        onMeasurementsClear={noop}
      />
    );
    fireEvent.click(screen.getByTestId('preview-3d-delete-measurement'));
    expect(onDelete).toHaveBeenCalledWith('m1');
  });

  it('calls onMeasurementsClear when "Clear all" clicked', () => {
    const onClear = jest.fn();
    render(
      <MeasurePanel
        {...emptyProps}
        draftMeasurement={idleDraft}
        measurements={[makeMeasurement('m1')]}
        selectedMeasurementId={null}
        onMeasurementSelect={noop}
        onMeasurementDelete={noop}
        onMeasurementsClear={onClear}
      />
    );
    fireEvent.click(screen.getByTestId('preview-3d-clear-measurements'));
    expect(onClear).toHaveBeenCalledTimes(1);
  });
});
