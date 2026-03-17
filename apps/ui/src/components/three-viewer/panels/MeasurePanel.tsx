import { TbX } from 'react-icons/tb';
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
    <div className="flex flex-row items-center gap-3 px-3 w-full overflow-hidden h-full">
      <span className="text-xs shrink-0" style={{ color: 'var(--text-secondary)', maxWidth: '220px' }}>
        {helpText}
      </span>
      {measurements.length > 0 ? (
        <>
          <div className="shrink-0 h-4" style={{ width: '1px', backgroundColor: 'var(--border-primary)' }} />
          <div className="flex flex-row gap-2 overflow-x-auto flex-1" data-testid="preview-3d-measurements-tray">
            {measurements.map((m) => {
              const selected = m.id === selectedMeasurementId;
              return (
                <div
                  key={m.id}
                  className="flex items-center shrink-0 rounded overflow-hidden text-xs"
                  style={{
                    backgroundColor: selected ? 'var(--bg-tertiary)' : 'var(--bg-elevated)',
                    border: `1px solid ${selected ? 'var(--accent-primary)' : 'var(--border-primary)'}`,
                  }}
                >
                  <button
                    type="button"
                    data-testid="preview-3d-measurement-list-item"
                    aria-pressed={selected}
                    onClick={() => onMeasurementSelect(m.id)}
                    className="px-2 py-1"
                    style={{ color: selected ? 'var(--text-primary)' : 'var(--text-secondary)' }}
                  >
                    {formatMeasurementSummary3D(m)}
                  </button>
                  <button
                    type="button"
                    aria-label="Delete measurement"
                    data-testid="preview-3d-delete-measurement"
                    onClick={(e) => {
                      e.stopPropagation();
                      onMeasurementDelete(m.id);
                    }}
                    className="flex items-center justify-center px-1.5 py-1 transition-colors"
                    style={{
                      borderLeft: `1px solid ${selected ? 'var(--accent-primary)' : 'var(--border-primary)'}`,
                      color: 'var(--text-secondary)',
                      backgroundColor: 'transparent',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = 'color-mix(in srgb, var(--bg-primary) 60%, transparent)';
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
          <button
            type="button"
            data-testid="preview-3d-clear-measurements"
            onClick={onMeasurementsClear}
            className="text-xs shrink-0"
            style={{ color: 'var(--text-secondary)' }}
          >
            Clear all
          </button>
        </>
      ) : null}
    </div>
  );
}
