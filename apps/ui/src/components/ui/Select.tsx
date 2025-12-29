import { SelectHTMLAttributes, forwardRef } from 'react';

export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'size'> {
  /**
   * Size variant for the select component
   * - 'sm': Compact size for toolbars and tight spaces
   * - 'md': Default size for most use cases
   */
  size?: 'sm' | 'md';
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ className = '', disabled, size = 'md', children, ...props }, ref) => {
    // Base styles for VSCode-like appearance
    const baseStyles = `
      w-full rounded appearance-none bg-no-repeat
      focus:outline-none focus:ring-1
      transition-all duration-100 ease-in-out
    `
      .trim()
      .replace(/\s+/g, ' ');

    // Size-specific padding and text
    const sizeStyles = {
      sm: 'px-2 py-1 text-xs pr-7',
      md: 'px-3 py-2 text-sm pr-9',
    };

    // VSCode-style dropdown arrow SVG (clean chevron down)
    const dropdownArrow =
      "data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none'%3e%3cpath d='M4 6 L8 10 L12 6' stroke='%23cccccc' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3e%3c/svg%3e";

    const styles = {
      backgroundColor: disabled ? 'var(--bg-tertiary)' : 'var(--bg-elevated)',
      color: disabled ? 'var(--text-tertiary)' : 'var(--text-primary)',
      border: '1px solid var(--border-primary)',
      cursor: disabled ? 'not-allowed' : 'pointer',
      backgroundImage: `url("${dropdownArrow}")`,
      backgroundSize: size === 'sm' ? '12px 12px' : '14px 14px',
      backgroundPosition: size === 'sm' ? 'right 0.35rem center' : 'right 0.5rem center',
      opacity: disabled ? 0.6 : 1,
      boxShadow: 'none',
    };

    // VSCode-style focus ring
    const focusRingStyle = {
      '--tw-ring-color': 'var(--accent-primary)',
      '--tw-ring-offset-width': '0px',
      '--tw-ring-opacity': '0.5',
    } as React.CSSProperties;

    return (
      <select
        ref={ref}
        className={`${baseStyles} ${sizeStyles[size]} ${className}`}
        style={{ ...styles, ...focusRingStyle }}
        disabled={disabled}
        {...props}
      >
        {children}
      </select>
    );
  }
);

Select.displayName = 'Select';
