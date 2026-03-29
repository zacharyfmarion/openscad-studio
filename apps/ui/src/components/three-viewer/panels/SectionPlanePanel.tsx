import { Button, SegmentedControl, RangeSlider } from '../../ui';
import { clampSectionOffset, getSectionAxisBounds } from '../sectionPlaneController';
import type { SectionAxis, ToolContextPanelProps } from '../types';

const AXIS_OPTIONS: { value: SectionAxis; label: string; title: string }[] = [
  { value: 'x', label: 'X', title: 'Slice left/right (perpendicular to X axis)' },
  { value: 'y', label: 'Z', title: 'Slice top/bottom (perpendicular to Z axis)' },
  { value: 'z', label: 'Y', title: 'Slice front/back (perpendicular to Y axis)' },
];

const ROW = 'flex items-center justify-between gap-3';
const LABEL = 'text-xs shrink-0';

export function SectionPlanePanel({
  loadedModel,
  sectionState,
  onSectionStateChange,
  onSectionReset,
}: ToolContextPanelProps) {
  if (!loadedModel || !sectionState) {
    return null;
  }

  const axisBounds = getSectionAxisBounds(loadedModel.bounds, sectionState.axis);

  return (
    <div className="flex flex-col gap-2.5" data-testid="preview-3d-section-controls">
      {/* Axis */}
      <div className={ROW}>
        <span className={LABEL} style={{ color: 'var(--text-tertiary)' }}>
          Axis
        </span>
        <SegmentedControl
          options={AXIS_OPTIONS}
          value={sectionState.axis}
          size="sm"
          onChange={(axis) => {
            const bounds = getSectionAxisBounds(loadedModel.bounds, axis);
            onSectionStateChange({
              enabled: true,
              axis,
              inverted: false,
              offset: (bounds.min + bounds.max) / 2,
            });
          }}
          aria-label="Section plane axis"
        />
      </div>

      {/* Invert */}
      <div className={ROW}>
        <span className={LABEL} style={{ color: 'var(--text-tertiary)' }}>
          Invert
        </span>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={() => onSectionStateChange({ ...sectionState, inverted: !sectionState.inverted })}
          style={{
            color: sectionState.inverted ? 'var(--accent-primary)' : 'var(--text-secondary)',
            borderColor: sectionState.inverted ? 'var(--accent-primary)' : undefined,
          }}
        >
          {sectionState.inverted ? 'On' : 'Off'}
        </Button>
      </div>

      {/* Offset */}
      <div className="flex flex-col gap-1.5">
        <span className={LABEL} style={{ color: 'var(--text-tertiary)' }}>
          Offset
        </span>
        <RangeSlider
          min={axisBounds.min}
          max={axisBounds.max}
          step={Math.max(loadedModel.diagonal / 200, 0.01)}
          value={sectionState.offset}
          onChange={(value) =>
            onSectionStateChange({
              ...sectionState,
              offset: clampSectionOffset(loadedModel.bounds, sectionState.axis, value),
            })
          }
          aria-label="Section plane offset"
          data-testid="preview-3d-section-slider"
        />
      </div>

      {/* Footer */}
      <div className={ROW}>
        <span className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
          ← → nudge · R reset
        </span>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={onSectionReset}
          data-testid="preview-3d-section-reset"
        >
          Reset
        </Button>
      </div>
    </div>
  );
}
