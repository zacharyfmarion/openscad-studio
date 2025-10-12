import { LabelHTMLAttributes, forwardRef } from 'react';

export interface LabelProps extends LabelHTMLAttributes<HTMLLabelElement> {
  variant?: 'primary' | 'secondary' | 'tertiary';
  size?: 'xs' | 'sm' | 'md';
}

export const Label = forwardRef<HTMLLabelElement, LabelProps>(
  ({ variant = 'secondary', size = 'sm', className = '', children, ...props }, ref) => {
    const baseStyles = 'block font-medium mb-2';

    const sizeStyles = {
      xs: 'text-xs',
      sm: 'text-sm',
      md: 'text-base',
    };

    const colorStyles = {
      primary: { color: 'var(--text-primary)' },
      secondary: { color: 'var(--text-secondary)' },
      tertiary: { color: 'var(--text-tertiary)' },
    };

    return (
      <label
        ref={ref}
        className={`${baseStyles} ${sizeStyles[size]} ${className}`}
        style={colorStyles[variant]}
        {...props}
      >
        {children}
      </label>
    );
  }
);

Label.displayName = 'Label';
