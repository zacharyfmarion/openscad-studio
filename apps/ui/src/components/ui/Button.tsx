import { ButtonHTMLAttributes, CSSProperties, forwardRef } from 'react';
import { CONTROL_RADIUS_CLASS, CONTROL_SIZE_CLASSES } from './controlStyles';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'success' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  isActive?: boolean;
}

const DISABLED_STYLE: CSSProperties = {
  backgroundColor: 'var(--bg-secondary)',
  color: 'var(--text-secondary)',
  cursor: 'not-allowed',
  opacity: 0.65,
  border: '1px solid var(--border-primary)',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'secondary',
      size = 'md',
      isActive,
      className = '',
      disabled,
      style,
      onMouseEnter: userMouseEnter,
      onMouseLeave: userMouseLeave,
      ...props
    },
    ref
  ) => {
    const getBaseStyle = (): CSSProperties => {
      if (disabled) return DISABLED_STYLE;
      switch (variant) {
        case 'primary':
          return {
            backgroundColor: 'var(--accent-primary)',
            color: 'var(--text-inverse)',
            border: '1px solid var(--accent-primary)',
            boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.06)',
          };
        case 'secondary':
          return {
            backgroundColor: isActive
              ? 'color-mix(in srgb, var(--accent-primary) 15%, var(--bg-secondary))'
              : 'var(--bg-secondary)',
            color: 'var(--text-primary)',
            border: `1px solid ${isActive ? 'var(--accent-primary)' : 'var(--border-primary)'}`,
          };
        case 'ghost':
          return { backgroundColor: 'transparent', color: 'var(--text-secondary)' };
        case 'success':
          return {
            backgroundColor: 'var(--color-success)',
            color: 'var(--text-inverse)',
            border: 'none',
          };
        case 'danger':
          return {
            backgroundColor: 'var(--color-error)',
            color: 'var(--text-inverse)',
            border: 'none',
          };
      }
    };

    const handleMouseEnter = (e: React.MouseEvent<HTMLButtonElement>) => {
      if (!disabled) {
        const el = e.currentTarget;
        switch (variant) {
          case 'primary':
            el.style.backgroundColor = 'var(--accent-hover)';
            el.style.borderColor = 'var(--accent-hover)';
            break;
          case 'secondary':
            el.style.backgroundColor = isActive
              ? 'color-mix(in srgb, var(--accent-primary) 22%, var(--bg-secondary))'
              : 'color-mix(in srgb, var(--accent-primary) 12%, var(--bg-secondary))';
            break;
          case 'ghost':
            el.style.backgroundColor = 'var(--bg-secondary)';
            el.style.color = 'var(--text-primary)';
            break;
        }
      }
      userMouseEnter?.(e);
    };

    const handleMouseLeave = (e: React.MouseEvent<HTMLButtonElement>) => {
      if (!disabled) {
        const el = e.currentTarget;
        switch (variant) {
          case 'primary':
            el.style.backgroundColor = 'var(--accent-primary)';
            el.style.borderColor = 'var(--accent-primary)';
            break;
          case 'secondary':
            el.style.backgroundColor = isActive
              ? 'color-mix(in srgb, var(--accent-primary) 15%, var(--bg-secondary))'
              : 'var(--bg-secondary)';
            break;
          case 'ghost':
            el.style.backgroundColor = 'transparent';
            el.style.color = 'var(--text-secondary)';
            break;
        }
      }
      userMouseLeave?.(e);
    };

    const baseClasses = `inline-flex items-center justify-center ${CONTROL_RADIUS_CLASS} font-medium transition-colors focus:outline-none focus:ring-2`;

    return (
      <button
        ref={ref}
        className={`${baseClasses} ${CONTROL_SIZE_CLASSES[size]} ${className}`}
        style={{ ...getBaseStyle(), ...style }}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        disabled={disabled}
        {...props}
      />
    );
  }
);

Button.displayName = 'Button';
