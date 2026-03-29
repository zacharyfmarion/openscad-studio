import type { ReactNode } from 'react';
import { CONTROL_RADIUS_CLASS, CONTROL_SIZE_CLASSES } from './controlStyles';

interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  icon?: ReactNode;
  title?: string;
  testId?: string;
}

interface SegmentedControlProps<T extends string> {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  size?: 'sm' | 'md' | 'lg';
  density?: 'default' | 'compact';
  'aria-label'?: string;
}

const ACTIVE_BG = 'color-mix(in srgb, var(--accent-primary) 15%, var(--bg-secondary))';
const ACTIVE_BG_HOVER = 'color-mix(in srgb, var(--accent-primary) 22%, var(--bg-secondary))';
const INACTIVE_BG = 'var(--bg-secondary)';
const INACTIVE_BG_HOVER = 'color-mix(in srgb, var(--accent-primary) 8%, var(--bg-secondary))';
const OPTION_HEIGHTS = {
  sm: '26px',
  md: '30px',
  lg: '34px',
} as const;

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  size = 'md',
  density = 'default',
  'aria-label': ariaLabel,
}: SegmentedControlProps<T>) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={`inline-flex w-fit ${CONTROL_RADIUS_CLASS} overflow-hidden`}
      style={{
        border: '1px solid var(--border-secondary)',
        backgroundColor: 'var(--bg-secondary)',
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
            className={`${CONTROL_SIZE_CLASSES[size]} ${density === 'compact' ? 'px-2' : ''} inline-flex items-center justify-center whitespace-nowrap font-medium leading-none transition-colors`}
            style={{
              height: OPTION_HEIGHTS[size],
              backgroundColor: active ? ACTIVE_BG : INACTIVE_BG,
              color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
              boxShadow: active ? 'inset 0 1px 0 rgba(255,255,255,0.05)' : undefined,
              borderLeft: i > 0 ? '1px solid var(--border-secondary)' : undefined,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = active ? ACTIVE_BG_HOVER : INACTIVE_BG_HOVER;
              if (!active) e.currentTarget.style.color = 'var(--text-primary)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = active ? ACTIVE_BG : INACTIVE_BG;
              if (!active) e.currentTarget.style.color = 'var(--text-secondary)';
            }}
          >
            <span
              className={`inline-flex items-center justify-center leading-none ${option.icon ? 'gap-1.5' : ''}`}
            >
              {option.icon}
              <span>{option.label}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
