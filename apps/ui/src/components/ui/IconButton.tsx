import { ButtonHTMLAttributes, forwardRef } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

const iconButton = cva(
  [
    'inline-flex items-center justify-center rounded-lg transition-colors',
    'focus:outline-none focus:ring-2 focus:ring-[var(--accent-primary)]',
    'disabled:opacity-65 disabled:cursor-not-allowed',
  ].join(' '),
  {
    variants: {
      variant: {
        // Transparent base — for palette/sidebar icon buttons
        default: [
          'border border-transparent bg-transparent text-[var(--text-secondary)]',
          'hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]',
          'disabled:hover:bg-transparent disabled:hover:text-[var(--text-secondary)]',
          'data-[active]:bg-[var(--bg-tertiary)] data-[active]:text-[var(--accent-primary)] data-[active]:border-[var(--accent-primary)]',
          'data-[active]:hover:bg-[var(--bg-tertiary)]',
        ].join(' '),
        // Elevated base — for toolbar buttons floating over the 3D canvas
        toolbar: [
          'border border-[var(--border-primary)] bg-[var(--bg-elevated)] text-[var(--text-secondary)]',
          'hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]',
          'disabled:hover:bg-[var(--bg-elevated)] disabled:hover:text-[var(--text-secondary)]',
          'data-[active]:bg-[var(--bg-tertiary)] data-[active]:text-[var(--accent-primary)] data-[active]:border-[var(--accent-primary)]',
          'data-[active]:hover:bg-[var(--bg-tertiary)]',
        ].join(' '),
      },
      size: {
        sm: 'h-7 w-7',
        md: 'h-8 w-8',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'md',
    },
  }
);

export interface IconButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof iconButton> {
  isActive?: boolean;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ variant, size, isActive, className = '', type = 'button', ...props }, ref) => {
    return (
      <button
        ref={ref}
        type={type}
        className={iconButton({ variant, size, className })}
        data-active={isActive || undefined}
        {...props}
      />
    );
  }
);

IconButton.displayName = 'IconButton';
