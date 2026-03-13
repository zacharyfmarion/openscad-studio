import { ButtonHTMLAttributes, forwardRef } from 'react';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'success' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'secondary', size = 'md', className = '', disabled, style, ...props }, ref) => {
    const baseStyles = 'rounded font-medium transition-colors focus:outline-none focus:ring-2';
    const disabledStyles = {
      backgroundColor: 'var(--bg-secondary)',
      color: 'var(--text-secondary)',
      cursor: 'not-allowed',
      opacity: 0.65,
      border: '1px solid var(--border-secondary)',
    } as const;

    const sizeStyles = {
      sm: 'px-2 py-0.5 text-xs',
      md: 'px-3 py-1.5 text-sm',
      lg: 'px-4 py-2 text-base',
    };

    const variantStyles = {
      primary: disabled
        ? disabledStyles
        : {
            backgroundColor: 'var(--accent-primary)',
            color: 'var(--text-inverse)',
            border: '1px solid var(--accent-primary)',
            boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.06)',
          },
      secondary: disabled
        ? disabledStyles
        : {
            backgroundColor: 'var(--bg-secondary)',
            color: 'var(--text-primary)',
            border: '1px solid var(--border-secondary)',
          },
      success: disabled
        ? disabledStyles
        : { backgroundColor: 'var(--color-success)', color: 'var(--text-inverse)' },
      danger: disabled
        ? disabledStyles
        : { backgroundColor: 'var(--color-error)', color: 'var(--text-inverse)' },
      ghost: disabled
        ? { backgroundColor: 'transparent', color: 'var(--text-secondary)', cursor: 'not-allowed', opacity: 0.65 }
        : { backgroundColor: 'transparent', color: 'var(--text-secondary)' },
    };

    return (
      <button
        ref={ref}
        className={`${baseStyles} ${sizeStyles[size]} ${className}`}
        style={{ ...variantStyles[variant], ...style }}
        disabled={disabled}
        {...props}
      />
    );
  }
);

Button.displayName = 'Button';
