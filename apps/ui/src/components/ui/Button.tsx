import { ButtonHTMLAttributes, forwardRef } from 'react';
import { CONTROL_RADIUS_CLASS, CONTROL_SIZE_CLASSES } from './controlStyles';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'success' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'secondary', size = 'md', className = '', disabled, style, ...props }, ref) => {
    const baseStyles = `inline-flex items-center justify-center ${CONTROL_RADIUS_CLASS} font-medium transition-colors focus:outline-none focus:ring-2`;
    const disabledStyles = {
      backgroundColor: 'var(--bg-secondary)',
      color: 'var(--text-secondary)',
      cursor: 'not-allowed',
      opacity: 0.65,
      border: '1px solid var(--border-primary)',
    } as const;

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
        className={`${baseStyles} ${CONTROL_SIZE_CLASSES[size]} ${className}`}
        style={{ ...variantStyles[variant], ...style }}
        disabled={disabled}
        {...props}
      />
    );
  }
);

Button.displayName = 'Button';
