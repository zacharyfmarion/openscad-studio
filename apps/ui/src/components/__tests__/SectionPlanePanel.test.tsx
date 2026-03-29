/** @jest-environment jsdom */

import { render, screen, fireEvent } from '@testing-library/react';
import * as THREE from 'three';
import { renderWithProviders } from './test-utils';
import { SectionPlanePanel } from '../three-viewer/panels/SectionPlanePanel';
import type {
  SectionPlaneState,
  LoadedPreviewModel,
  MeasurementRecord3D,
} from '../three-viewer/types';

function makeModel(): LoadedPreviewModel {
  const bounds = new THREE.Box3(new THREE.Vector3(-5, -5, -5), new THREE.Vector3(5, 5, 5));
  return {
    root: new THREE.Object3D(),
    meshes: [],
    bounds,
    size: new THREE.Vector3(10, 10, 10),
    center: new THREE.Vector3(0, 0, 0),
    diagonal: Math.sqrt(300),
    version: 'test',
  };
}

function makeSectionState(overrides?: Partial<SectionPlaneState>): SectionPlaneState {
  return { enabled: true, axis: 'x', inverted: false, offset: 0, ...overrides };
}

const noop = () => {};
const emptyProps = {
  measurements: [] as MeasurementRecord3D[],
  selectedMeasurementId: null,
  draftMeasurement: {
    status: 'idle' as const,
    start: null,
    current: null,
    snapKind: null,
    axisLock: null,
  },
  selection: { objectUuid: null, point: null, normal: null, bounds: null },
  onMeasurementSelect: noop,
  onMeasurementDelete: noop,
  onMeasurementsClear: noop,
};

describe('SectionPlanePanel', () => {
  it('returns null when loadedModel is missing', () => {
    const { container } = render(
      <SectionPlanePanel
        {...emptyProps}
        loadedModel={null}
        sectionState={makeSectionState()}
        onSectionStateChange={noop}
        onSectionReset={noop}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it('returns null when sectionState is missing', () => {
    const { container } = render(
      <SectionPlanePanel
        {...emptyProps}
        loadedModel={makeModel()}
        sectionState={null}
        onSectionStateChange={noop}
        onSectionReset={noop}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders Axis, Invert, Offset, and Reset controls', () => {
    renderWithProviders(
      <SectionPlanePanel
        {...emptyProps}
        loadedModel={makeModel()}
        sectionState={makeSectionState()}
        onSectionStateChange={noop}
        onSectionReset={noop}
      />
    );

    expect(screen.getByText('Axis')).toBeInTheDocument();
    expect(screen.getByText('Invert')).toBeInTheDocument();
    expect(screen.getByText('Offset')).toBeInTheDocument();
    expect(screen.getByTestId('preview-3d-section-reset')).toBeInTheDocument();
  });

  it('reflects inverted state on the toggle', () => {
    const { rerender } = renderWithProviders(
      <SectionPlanePanel
        {...emptyProps}
        loadedModel={makeModel()}
        sectionState={makeSectionState({ inverted: false })}
        onSectionStateChange={noop}
        onSectionReset={noop}
      />
    );
    expect(screen.getByRole('checkbox', { name: /invert/i })).not.toBeChecked();

    rerender(
      <SectionPlanePanel
        {...emptyProps}
        loadedModel={makeModel()}
        sectionState={makeSectionState({ inverted: true })}
        onSectionStateChange={noop}
        onSectionReset={noop}
      />
    );
    expect(screen.getByRole('checkbox', { name: /invert/i })).toBeChecked();
  });

  it('calls onSectionStateChange with toggled inverted when toggle clicked', () => {
    const onChange = jest.fn();
    renderWithProviders(
      <SectionPlanePanel
        {...emptyProps}
        loadedModel={makeModel()}
        sectionState={makeSectionState({ inverted: false })}
        onSectionStateChange={onChange}
        onSectionReset={noop}
      />
    );

    fireEvent.click(screen.getByRole('checkbox', { name: /invert/i }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ inverted: true }));
  });

  it('calls onSectionReset when Reset button clicked', () => {
    const onReset = jest.fn();
    renderWithProviders(
      <SectionPlanePanel
        {...emptyProps}
        loadedModel={makeModel()}
        sectionState={makeSectionState()}
        onSectionStateChange={noop}
        onSectionReset={onReset}
      />
    );

    fireEvent.click(screen.getByTestId('preview-3d-section-reset'));
    expect(onReset).toHaveBeenCalledTimes(1);
  });
});
