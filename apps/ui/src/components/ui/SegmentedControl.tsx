import { CONTROL_RADIUS_CLASS, CONTROL_SIZE_CLASSES } from './controlStyles';

interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  title?: string;
  testId?: string;
}

interface SegmentedControlProps<T extends string> {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  size?: 'sm' | 'md' | 'lg';
  'aria-label'?: string;
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  size = 'md',
  'aria-label': ariaLabel,
}: SegmentedControlProps<T>) {
  const activeBackground = 'color-mix(in srgb, var(--accent-primary) 18%, var(--bg-elevated))';

  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={`inline-flex w-fit ${CONTROL_RADIUS_CLASS} overflow-hidden`}
      style={{
        border: '1px solid var(--border-secondary)',
        backgroundColor: 'var(--bg-elevated)',
      }}
    >
      {options.map((option, i) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            title={option.title ?? option.label}
            aria-pressed={active}
            data-testid={option.testId}
            onClick={() => onChange(option.value)}
            className={`${CONTROL_SIZE_CLASSES[size]} whitespace-nowrap font-medium transition-colors`}
            style={{
              backgroundColor: active ? activeBackground : 'var(--bg-elevated)',
              color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
              boxShadow: active ? 'inset 0 1px 0 rgba(255,255,255,0.05)' : undefined,
              borderLeft: i > 0 ? '1px solid var(--border-secondary)' : undefined,
            }}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
