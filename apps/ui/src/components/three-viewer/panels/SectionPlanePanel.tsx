import { Button, SegmentedControl, RangeSlider } from '../../ui';
import { clampSectionOffset, getSectionAxisBounds } from '../sectionPlaneController';
import type { SectionAxis, ToolContextPanelProps } from '../types';

const AXIS_OPTIONS: { value: SectionAxis; label: string; title: string }[] = [
  { value: 'x', label: 'X', title: 'Slice left/right (perpendicular to X axis)' },
  { value: 'y', label: 'Z', title: 'Slice top/bottom (perpendicular to Z axis)' },
  { value: 'z', label: 'Y', title: 'Slice front/back (perpendicular to Y axis)' },
];

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
    <div
      className="flex flex-row items-center gap-3 px-3 w-full"
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
      data-testid="preview-3d-section-controls"
    >
      <span className="text-xs font-medium shrink-0" style={{ color: 'var(--text-secondary)' }}>
        Section
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

      <Button
        type="button"
        size="sm"
        variant="secondary"
        onClick={() => onSectionStateChange({ ...sectionState, inverted: !sectionState.inverted })}
        className="shrink-0"
        style={{
          backgroundColor: sectionState.inverted ? 'var(--bg-tertiary)' : undefined,
          color: sectionState.inverted ? 'var(--accent-primary)' : 'var(--text-secondary)',
        }}
      >
        Flip
      </Button>

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
        className="flex-1"
      />

      <Button
        type="button"
        size="sm"
        variant="ghost"
        onClick={onSectionReset}
        className="shrink-0"
        data-testid="preview-3d-section-reset"
      >
        Reset
      </Button>

      <span className="text-[11px] shrink-0" style={{ color: 'var(--text-tertiary)' }}>
        ← → to nudge · R to reset
      </span>
    </div>
  );
}
