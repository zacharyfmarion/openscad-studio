import { TbX } from 'react-icons/tb';
import { Button } from '../../ui';
import { formatMeasurementSummary3D } from '../measurementController3d';
import type { ToolContextPanelProps } from '../types';

export function MeasurePanel({
  draftMeasurement,
  measurements,
  selectedMeasurementId,
  onMeasurementSelect,
  onMeasurementDelete,
  onMeasurementsClear,
}: ToolContextPanelProps) {
  const helpText =
    draftMeasurement.status === 'placing-end'
      ? 'Click to finish. Hold Shift to lock axis. Esc cancels.'
      : 'Click to place start point. Hold Shift after to lock to axis.';

  return (
    <div className="flex min-h-0 flex-col gap-3">
      <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
        {helpText}
      </span>

      {measurements.length > 0 ? (
        <>
          <div
            className="min-h-0 overflow-y-auto pr-1 space-y-1.5"
            style={{ maxHeight: '160px' }}
            data-testid="preview-3d-measurements-tray"
          >
            {measurements.map((m) => {
              const selected = m.id === selectedMeasurementId;
              return (
                <div
                  key={m.id}
                  className="flex shrink-0 items-center rounded-lg overflow-hidden text-xs"
                  style={{
                    backgroundColor: selected ? 'var(--bg-tertiary)' : 'var(--bg-elevated)',
                    border: `1px solid ${selected ? 'var(--accent-primary)' : 'var(--border-primary)'}`,
                  }}
                >
                  {/* eslint-disable-next-line no-restricted-syntax -- left half of a split chip; <Button> inline-flex centering would push the text out of the chip */}
                  <button
                    type="button"
                    data-testid="preview-3d-measurement-list-item"
                    aria-pressed={selected}
                    onClick={() => onMeasurementSelect(m.id)}
                    className="flex-1 px-2 py-1.5 text-left"
                    style={{ color: selected ? 'var(--text-primary)' : 'var(--text-secondary)' }}
                  >
                    {formatMeasurementSummary3D(m)}
                  </button>
                  {/* eslint-disable-next-line no-restricted-syntax -- right half of the chip delete action; uses imperative onMouseEnter/Leave to tint the bg */}
                  <button
                    type="button"
                    aria-label="Delete measurement"
                    data-testid="preview-3d-delete-measurement"
                    onClick={(e) => {
                      e.stopPropagation();
                      onMeasurementDelete(m.id);
                    }}
                    className="flex items-center justify-center px-2 py-1.5 transition-colors"
                    style={{
                      borderLeft: `1px solid ${selected ? 'var(--accent-primary)' : 'var(--border-primary)'}`,
                      color: 'var(--text-secondary)',
                      backgroundColor: 'transparent',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor =
                        'color-mix(in srgb, var(--bg-primary) 60%, transparent)';
                      e.currentTarget.style.color = 'var(--text-primary)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'transparent';
                      e.currentTarget.style.color = 'var(--text-secondary)';
                    }}
                  >
                    <TbX size={12} />
                  </button>
                </div>
              );
            })}
          </div>

          <Button
            type="button"
            size="sm"
            variant="ghost"
            data-testid="preview-3d-clear-measurements"
            onClick={onMeasurementsClear}
            className="w-full shrink-0"
          >
            Clear all
          </Button>
        </>
      ) : null}
    </div>
  );
}
