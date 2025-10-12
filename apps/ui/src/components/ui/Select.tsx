import { SelectHTMLAttributes, forwardRef } from 'react';

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ className = '', disabled, children, ...props }, ref) => {
    const baseStyles = 'w-full rounded px-3 py-2.5 text-sm focus:outline-none focus:ring-2 border cursor-pointer appearance-none bg-no-repeat pr-10';

    // Custom dropdown arrow SVG
    const dropdownArrow = "data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3e%3cpolyline points='6 9 12 15 18 9'%3e%3c/polyline%3e%3c/svg%3e";

    const styles = {
      backgroundColor: disabled ? 'var(--bg-tertiary)' : 'var(--bg-elevated)',
      color: disabled ? 'var(--text-tertiary)' : 'var(--text-primary)',
      borderColor: 'var(--border-secondary)',
      cursor: disabled ? 'not-allowed' : 'pointer',
      backgroundImage: `url("${dropdownArrow}")`,
      backgroundSize: '1.5em 1.5em',
      backgroundPosition: 'right 0.5em center',
      opacity: disabled ? 0.5 : 1,
    };

    return (
      <select
        ref={ref}
        className={`${baseStyles} ${className}`}
        style={styles}
        disabled={disabled}
        {...props}
      >
        {children}
      </select>
    );
  }
);

Select.displayName = 'Select';
