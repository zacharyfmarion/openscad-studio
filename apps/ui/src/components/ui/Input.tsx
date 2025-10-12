import { InputHTMLAttributes, forwardRef } from 'react';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  error?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ error, className = '', disabled, ...props }, ref) => {
    const baseStyles = 'w-full rounded px-3 py-2 text-sm focus:outline-none focus:ring-2';

    const styles = {
      backgroundColor: disabled ? 'var(--bg-tertiary)' : 'var(--bg-elevated)',
      color: disabled ? 'var(--text-tertiary)' : 'var(--text-primary)',
      borderColor: error ? 'var(--color-error)' : 'var(--border-primary)',
      cursor: disabled ? 'not-allowed' : 'text',
    };

    return (
      <input
        ref={ref}
        className={`${baseStyles} ${className}`}
        style={styles}
        disabled={disabled}
        {...props}
      />
    );
  }
);

Input.displayName = 'Input';
