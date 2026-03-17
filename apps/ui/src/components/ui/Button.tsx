import { ButtonHTMLAttributes, forwardRef } from 'react';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'success' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'secondary', size = 'md', className = '', disabled, style, ...props }, ref) => {
    const baseStyles =
      'inline-flex items-center justify-center rounded-lg font-medium transition-colors focus:outline-none focus:ring-2';
    const disabledStyles = {
      backgroundColor: 'var(--bg-secondary)',
      color: 'var(--text-secondary)',
      cursor: 'not-allowed',
      opacity: 0.65,
      border: '1px solid var(--border-primary)',
    } as const;

    const sizeStyles = {
      sm: 'h-7 px-2.5 text-xs',
      md: 'h-8 px-3 text-sm',
      lg: 'h-9 px-4 text-base',
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
            border: '1px solid var(--border-primary)',
          },
      success: disabled
        ? disabledStyles
        : { backgroundColor: 'var(--color-success)', color: 'var(--text-inverse)', border: 'none' },
      danger: disabled
        ? disabledStyles
        : { backgroundColor: 'var(--color-error)', color: 'var(--text-inverse)', border: 'none' },
      ghost: disabled
        ? {
            backgroundColor: 'transparent',
            color: 'var(--text-secondary)',
            cursor: 'not-allowed',
            opacity: 0.65,
            border: 'none',
          }
        : { backgroundColor: 'transparent', color: 'var(--text-secondary)', border: 'none' },
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
