import * as Switch from '@radix-ui/react-switch';
import type { ComponentPropsWithoutRef } from 'react';

export interface ToggleProps extends Omit<
  ComponentPropsWithoutRef<typeof Switch.Root>,
  'checked' | 'onCheckedChange' | 'onChange'
> {
  checked: boolean;
  onChange: (checked: boolean) => void;
}

export const Toggle = ({ checked, onChange, className = '', ...props }: ToggleProps) => {
  return (
    <Switch.Root
      checked={checked}
      onCheckedChange={onChange}
      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)] focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
      style={{
        backgroundColor: checked ? 'var(--accent-primary)' : 'var(--bg-secondary)',
        border: '1px solid var(--border-primary)',
      }}
      {...props}
    >
      <Switch.Thumb className="pointer-events-none block h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-100 will-change-transform data-[state=checked]:translate-x-[22px] data-[state=unchecked]:translate-x-[1px]" />
    </Switch.Root>
  );
};

Toggle.displayName = 'Toggle';
