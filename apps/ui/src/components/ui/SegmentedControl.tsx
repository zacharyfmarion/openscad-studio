interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  title?: string;
}

interface SegmentedControlProps<T extends string> {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  'aria-label'?: string;
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  'aria-label': ariaLabel,
}: SegmentedControlProps<T>) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className="flex h-8 rounded-lg overflow-hidden"
      style={{ border: '1px solid var(--border-secondary)' }}
    >
      {options.map((option, i) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            title={option.title ?? option.label}
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className="h-full px-2.5 text-xs font-medium transition-colors"
            style={{
              backgroundColor: active ? 'var(--bg-tertiary)' : 'var(--bg-elevated)',
              color: active ? 'var(--accent-primary)' : 'var(--text-secondary)',
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
