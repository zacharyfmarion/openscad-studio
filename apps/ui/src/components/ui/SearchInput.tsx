import { forwardRef, type InputHTMLAttributes } from 'react';
import { TbSearch, TbX } from 'react-icons/tb';

export interface SearchInputProps extends InputHTMLAttributes<HTMLInputElement> {
  /** Called when the inline clear button is pressed. When omitted, no clear button is shown. */
  onClear?: () => void;
  /** Classes for the wrapping element (e.g. `flex-1` so the field grows to fill its row). */
  containerClassName?: string;
}

/**
 * Text input with a leading search icon and an optional inline clear button.
 *
 * Styling mirrors the shared `Input` component so it sits naturally inside any theme.
 */
export const SearchInput = forwardRef<HTMLInputElement, SearchInputProps>(
  ({ className = '', containerClassName = '', value, onClear, disabled, ...props }, ref) => {
    const hasValue = value != null && (typeof value === 'string' ? value.length > 0 : true);
    const showClear = Boolean(onClear) && hasValue && !disabled;

    return (
      <div className={`relative ${containerClassName}`}>
        <span
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2"
          style={{ color: 'var(--text-tertiary)' }}
          aria-hidden="true"
        >
          <TbSearch size={15} />
        </span>
        <input
          ref={ref}
          type="text"
          value={value}
          disabled={disabled}
          className={`w-full rounded-lg border py-2 pl-9 text-sm focus:outline-none focus:ring-2 ${
            showClear ? 'pr-9' : 'pr-3'
          } ${className}`}
          style={{
            backgroundColor: disabled ? 'var(--bg-tertiary)' : 'var(--bg-elevated)',
            color: disabled ? 'var(--text-tertiary)' : 'var(--text-primary)',
            borderColor: 'var(--border-primary)',
            cursor: disabled ? 'not-allowed' : 'text',
          }}
          {...props}
        />
        {showClear && (
          <button
            type="button"
            onClick={onClear}
            aria-label="Clear search"
            className="absolute right-2 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-md transition-colors"
            style={{ color: 'var(--text-tertiary)' }}
            onMouseEnter={(event) => {
              event.currentTarget.style.backgroundColor = 'var(--bg-secondary)';
              event.currentTarget.style.color = 'var(--text-primary)';
            }}
            onMouseLeave={(event) => {
              event.currentTarget.style.backgroundColor = 'transparent';
              event.currentTarget.style.color = 'var(--text-tertiary)';
            }}
          >
            <TbX size={14} />
          </button>
        )}
      </div>
    );
  }
);

SearchInput.displayName = 'SearchInput';
