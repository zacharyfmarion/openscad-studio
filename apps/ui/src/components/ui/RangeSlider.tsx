interface RangeSliderProps {
  id?: string;
  min: number;
  max: number;
  step?: number;
  value: number;
  onChange: (value: number) => void;
  'aria-label'?: string;
  className?: string;
  'data-testid'?: string;
}

export function RangeSlider({
  id,
  min,
  max,
  step = 1,
  value,
  onChange,
  'aria-label': ariaLabel,
  className = '',
  'data-testid': testId,
}: RangeSliderProps) {
  const fillPercent = max > min ? ((value - min) / (max - min)) * 100 : 0;

  return (
    <input
      id={id}
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      aria-label={ariaLabel}
      data-testid={testId}
      className={`h-1.5 rounded-full appearance-none cursor-pointer ${className}`}
      style={{
        background: `linear-gradient(to right, var(--accent-primary) 0%, var(--accent-primary) ${fillPercent}%, color-mix(in srgb, var(--bg-tertiary) 80%, var(--border-primary)) ${fillPercent}%, color-mix(in srgb, var(--bg-tertiary) 80%, var(--border-primary)) 100%)`,
      }}
    />
  );
}
