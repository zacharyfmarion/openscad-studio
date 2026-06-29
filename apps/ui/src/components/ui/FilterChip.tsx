import { forwardRef, type ButtonHTMLAttributes, type CSSProperties } from 'react';

export interface FilterChipProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Whether the chip is the active selection. */
  selected?: boolean;
  /** Optional count shown in a trailing badge (e.g. number of edited parameters). */
  count?: number;
  /** Render a small leading status dot (used to flag "edited"-style chips). */
  showDot?: boolean;
}

/**
 * Pill-style toggle button used for filter rows. Supports a selected state, an optional leading
 * status dot, and an optional trailing count badge.
 */
export const FilterChip = forwardRef<HTMLButtonElement, FilterChipProps>(
  ({ selected = false, count, showDot = false, className = '', children, ...props }, ref) => {
    const baseStyle: CSSProperties = selected
      ? {
          backgroundColor: 'color-mix(in srgb, var(--accent-primary) 15%, var(--bg-secondary))',
          color: 'var(--text-primary)',
          border: '1px solid var(--accent-primary)',
        }
      : {
          backgroundColor: 'transparent',
          color: 'var(--text-secondary)',
          border: '1px solid var(--border-primary)',
        };

    return (
      <button
        ref={ref}
        type="button"
        aria-pressed={selected}
        className={`inline-flex h-7 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3 text-xs font-medium transition-colors focus:outline-none focus:ring-2 ${className}`}
        style={baseStyle}
        onMouseEnter={(event) => {
          if (!selected) {
            event.currentTarget.style.backgroundColor =
              'color-mix(in srgb, var(--accent-primary) 10%, transparent)';
            event.currentTarget.style.color = 'var(--text-primary)';
          }
          props.onMouseEnter?.(event);
        }}
        onMouseLeave={(event) => {
          if (!selected) {
            event.currentTarget.style.backgroundColor = 'transparent';
            event.currentTarget.style.color = 'var(--text-secondary)';
          }
          props.onMouseLeave?.(event);
        }}
        {...props}
      >
        {showDot && (
          <span
            className="h-1.5 w-1.5 shrink-0 rounded-full"
            style={{ backgroundColor: 'var(--accent-primary)' }}
            aria-hidden="true"
          />
        )}
        <span>{children}</span>
        {typeof count === 'number' && (
          <span
            className="inline-flex min-w-[18px] items-center justify-center rounded-full px-1.5 text-[10px] font-semibold tabular-nums"
            style={{
              backgroundColor: selected
                ? 'color-mix(in srgb, var(--accent-primary) 22%, transparent)'
                : 'var(--bg-tertiary)',
              color: selected ? 'var(--accent-primary)' : 'var(--text-secondary)',
            }}
          >
            {count}
          </span>
        )}
      </button>
    );
  }
);

FilterChip.displayName = 'FilterChip';
