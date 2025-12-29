import { ButtonHTMLAttributes, forwardRef } from 'react';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'success' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'secondary', size = 'md', className = '', disabled, ...props }, ref) => {
    const baseStyles = 'rounded font-medium transition-colors focus:outline-none focus:ring-2';

    const sizeStyles = {
      sm: 'px-2 py-0.5 text-xs',
      md: 'px-3 py-1.5 text-sm',
      lg: 'px-4 py-2 text-base',
    };

    const variantStyles = {
      primary: disabled
        ? {
            backgroundColor: 'var(--bg-tertiary)',
            color: 'var(--text-tertiary)',
            cursor: 'not-allowed',
          }
        : { backgroundColor: 'var(--accent-primary)', color: 'var(--text-inverse)' },
      secondary: disabled
        ? {
            backgroundColor: 'var(--bg-tertiary)',
            color: 'var(--text-tertiary)',
            cursor: 'not-allowed',
          }
        : { backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)' },
      success: disabled
        ? {
            backgroundColor: 'var(--bg-tertiary)',
            color: 'var(--text-tertiary)',
            cursor: 'not-allowed',
          }
        : { backgroundColor: 'var(--color-success)', color: 'var(--text-inverse)' },
      danger: disabled
        ? {
            backgroundColor: 'var(--bg-tertiary)',
            color: 'var(--text-tertiary)',
            cursor: 'not-allowed',
          }
        : { backgroundColor: 'var(--color-error)', color: 'var(--text-inverse)' },
      ghost: disabled
        ? { backgroundColor: 'transparent', color: 'var(--text-tertiary)', cursor: 'not-allowed' }
        : { backgroundColor: 'transparent', color: 'var(--text-secondary)' },
    };

    return (
      <button
        ref={ref}
        className={`${baseStyles} ${sizeStyles[size]} ${className}`}
        style={variantStyles[variant]}
        disabled={disabled}
        {...props}
      />
    );
  }
);

Button.displayName = 'Button';
