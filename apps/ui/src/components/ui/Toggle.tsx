import { InputHTMLAttributes, forwardRef } from 'react';

export interface ToggleProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  checked: boolean;
}

export const Toggle = forwardRef<HTMLInputElement, ToggleProps>(
  ({ checked, className = '', ...props }, ref) => {
    return (
      <label className={`relative inline-flex h-6 w-11 cursor-pointer items-center ${className}`}>
        <input
          ref={ref}
          type="checkbox"
          checked={checked}
          className="peer absolute inset-0 m-0 h-full w-full cursor-pointer opacity-0"
          {...props}
        />
        <div
          aria-hidden="true"
          className="pointer-events-none h-6 w-11 rounded-full peer peer-focus:outline-none peer-focus:ring-2 peer-checked:after:translate-x-full peer-checked:after:border-white after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:bg-white after:transition-all after:content-['']"
          style={{
            backgroundColor: checked ? 'var(--accent-primary)' : 'var(--bg-elevated)',
            borderColor: 'var(--border-primary)',
          }}
        />
      </label>
    );
  }
);

Toggle.displayName = 'Toggle';
