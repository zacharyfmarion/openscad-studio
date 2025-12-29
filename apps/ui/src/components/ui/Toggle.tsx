import { InputHTMLAttributes, forwardRef } from 'react';

export interface ToggleProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  checked: boolean;
}

export const Toggle = forwardRef<HTMLInputElement, ToggleProps>(
  ({ checked, className = '', ...props }, ref) => {
    return (
      <label className={`relative inline-flex items-center cursor-pointer ${className}`}>
        <input ref={ref} type="checkbox" checked={checked} className="sr-only peer" {...props} />
        <div
          className="w-11 h-6 rounded-full peer peer-focus:outline-none peer-focus:ring-2 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border after:rounded-full after:h-5 after:w-5 after:transition-all"
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
