import { ButtonHTMLAttributes, forwardRef } from 'react';

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  size?: 'sm' | 'md';
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ size = 'md', className = '', disabled, style, type = 'button', ...props }, ref) => {
    const baseStyles = `
      inline-flex items-center justify-center rounded-lg border border-transparent
      bg-transparent transition-colors
      hover:bg-[var(--bg-secondary)] hover:text-[var(--text-primary)]
      focus:outline-none focus:ring-2 focus:ring-[var(--accent-primary)]
      disabled:cursor-not-allowed disabled:hover:bg-transparent
    `
      .trim()
      .replace(/\s+/g, ' ');

    const sizeStyles = {
      sm: 'h-7 w-7',
      md: 'h-8 w-8',
    };

    const iconStyles = disabled
      ? {
          color: 'var(--text-tertiary)',
          opacity: 0.65,
        }
      : {
          color: 'var(--text-secondary)',
        };

    return (
      <button
        ref={ref}
        type={type}
        className={`${baseStyles} ${sizeStyles[size]} ${className}`}
        style={{ ...iconStyles, ...style }}
        disabled={disabled}
        {...props}
      />
    );
  }
);

IconButton.displayName = 'IconButton';
