import type { MeasurementUnit } from '../stores/settingsStore';

export const UNIT_LABELS: Record<MeasurementUnit, string> = {
  mm: 'mm',
  cm: 'cm',
  in: 'in',
  units: '',
};

// Conversion factors from OpenSCAD's native unit to display unit
export const UNIT_SCALE: Record<MeasurementUnit, number> = {
  mm: 1,
  cm: 0.1,
  in: 1 / 25.4,
  units: 1,
};

export function formatWithUnit(value: number, unit: MeasurementUnit): string {
  const scaled = value * UNIT_SCALE[unit];
  const formatted = (Math.abs(scaled) >= 100 ? scaled.toFixed(1) : scaled.toFixed(2))
    .replace(/\.00$/, '')
    .replace(/(\.\d)0$/, '$1');
  const label = UNIT_LABELS[unit];
  return label ? `${formatted} ${label}` : formatted;
}
