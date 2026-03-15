/** @jest-environment jsdom */

import {
  applyAngleLock,
  createCommittedMeasurement,
  formatMeasurementReadout,
  getMeasurementMidpoint,
  isDraftMeasurementActive,
} from '../svg-viewer/measurementController';

describe('measurementController', () => {
  it('creates committed measurements with derived deltas and distance', () => {
    const measurement = createCommittedMeasurement({ x: 1, y: 2 }, { x: 4, y: 6 }, 123);

    expect(measurement.dx).toBe(3);
    expect(measurement.dy).toBe(4);
    expect(measurement.distance).toBe(5);
    expect(measurement.createdAt).toBe(123);
  });

  it('formats readouts and midpoints for labels', () => {
    const measurement = { start: { x: -2, y: 1 }, end: { x: 8, y: 6 } };

    expect(formatMeasurementReadout(measurement)).toContain('Distance');
    expect(formatMeasurementReadout(measurement)).toContain('mm');
    expect(getMeasurementMidpoint(measurement)).toEqual({ x: 3, y: 3.5 });
  });

  it('treats only an active end-placement draft as active', () => {
    expect(
      isDraftMeasurementActive({
        status: 'placing-end',
        start: { x: 0, y: 0 },
        current: { x: 1, y: 1 },
        snappedTarget: null,
      })
    ).toBe(true);

    expect(
      isDraftMeasurementActive({
        status: 'placing-start',
        start: null,
        current: null,
        snappedTarget: null,
      })
    ).toBe(false);
  });

  it('locks measurement angles to 15 degree increments', () => {
    const locked = applyAngleLock({ x: 0, y: 0 }, { x: 10, y: 2 });
    const distance = Math.sqrt(104);

    expect(locked.x).toBeCloseTo(Math.cos(Math.PI / 12) * distance, 4);
    expect(locked.y).toBeCloseTo(Math.sin(Math.PI / 12) * distance, 4);
  });
});
