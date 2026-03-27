import { forwardRef, type ComponentPropsWithoutRef } from 'react';
import * as RadixSelect from '@radix-ui/react-select';
import { CONTROL_RADIUS_CLASS, CONTROL_SIZE_CLASSES } from './controlStyles';

// ─── Root ────────────────────────────────────────────────────────────────────

export const Select = RadixSelect.Root;
export type SelectProps = ComponentPropsWithoutRef<typeof RadixSelect.Root>;

// ─── Trigger ─────────────────────────────────────────────────────────────────

export interface SelectTriggerProps extends ComponentPropsWithoutRef<typeof RadixSelect.Trigger> {
  size?: 'sm' | 'md';
}

export const SelectTrigger = forwardRef<HTMLButtonElement, SelectTriggerProps>(
  ({ size = 'md', className = '', style, children, ...props }, ref) => {
    return (
      <RadixSelect.Trigger
        ref={ref}
        // 'group' enables group-data-[state=open] on the chevron below
        // '[&>span]:truncate' targets the SelectValue <span> directly for truncation
        className={[
          'group inline-flex items-center justify-between gap-2 w-full',
          '[&>span]:truncate [&>span]:text-left [&>span]:flex-1 [&>span]:min-w-0',
          'transition-colors duration-100',
          'focus:outline-none',
          'data-[disabled]:cursor-not-allowed data-[disabled]:opacity-60',
          CONTROL_RADIUS_CLASS,
          CONTROL_SIZE_CLASSES[size],
          className,
        ]
          .filter(Boolean)
          .join(' ')}
        style={{
          backgroundColor: 'var(--bg-elevated)',
          color: 'var(--text-primary)',
          border: '1px solid var(--border-secondary)',
          ...style,
        }}
        onMouseEnter={(e) => {
          if (!props.disabled) {
            (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'var(--bg-primary)';
          }
        }}
        onMouseLeave={(e) => {
          if (!props.disabled) {
            (e.currentTarget as HTMLButtonElement).style.backgroundColor =
              style?.backgroundColor ?? 'var(--bg-elevated)';
          }
        }}
        onFocus={(e) => {
          e.currentTarget.style.boxShadow = '0 0 0 1px var(--border-focus)';
          e.currentTarget.style.borderColor = 'var(--border-focus)';
        }}
        onBlur={(e) => {
          e.currentTarget.style.boxShadow = '';
          e.currentTarget.style.borderColor = style?.borderColor ?? 'var(--border-secondary)';
        }}
        {...props}
      >
        {children}
        {/* Chevron rotates when trigger is open via group-data-[state=open] */}
        <svg
          width="12"
          height="12"
          viewBox="0 0 16 16"
          fill="none"
          aria-hidden="true"
          className="shrink-0 transition-transform duration-150 group-data-[state=open]:rotate-180"
          style={{ color: 'var(--text-secondary)', flexShrink: 0 }}
        >
          <path
            d="M4 6L8 10L12 6"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </RadixSelect.Trigger>
    );
  }
);
SelectTrigger.displayName = 'SelectTrigger';

// ─── Value ───────────────────────────────────────────────────────────────────

export const SelectValue = RadixSelect.Value;

// ─── Content ─────────────────────────────────────────────────────────────────

export const SelectContent = forwardRef<
  HTMLDivElement,
  ComponentPropsWithoutRef<typeof RadixSelect.Content>
>(({ className = '', style, children, ...props }, ref) => {
  return (
    <RadixSelect.Portal>
      <RadixSelect.Content
        ref={ref}
        position="popper"
        sideOffset={4}
        className={['overflow-hidden', CONTROL_RADIUS_CLASS, className].filter(Boolean).join(' ')}
        style={{
          backgroundColor: 'var(--bg-elevated)',
          border: '1px solid var(--border-secondary)',
          borderRadius: 'var(--radius-md)',
          boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
          zIndex: 9999,
          minWidth: 'var(--radix-select-trigger-width)',
          maxHeight: 'min(var(--radix-select-content-available-height), 18rem)',
          ...style,
        }}
        {...props}
      >
        <RadixSelect.Viewport className="p-1">{children}</RadixSelect.Viewport>
      </RadixSelect.Content>
    </RadixSelect.Portal>
  );
});
SelectContent.displayName = 'SelectContent';

// ─── Item ─────────────────────────────────────────────────────────────────────

export const SelectItem = forwardRef<
  HTMLDivElement,
  ComponentPropsWithoutRef<typeof RadixSelect.Item>
>(({ className = '', style, children, ...props }, ref) => {
  return (
    <RadixSelect.Item
      ref={ref}
      className={[
        'relative flex items-center justify-between',
        'rounded-md px-3 py-1.5 text-sm',
        'cursor-default select-none outline-none',
        'data-[disabled]:opacity-50 data-[disabled]:pointer-events-none',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      style={{
        color: 'var(--text-primary)',
        ...style,
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLDivElement).style.backgroundColor =
          'color-mix(in srgb, var(--accent-primary) 15%, var(--bg-elevated))';
      }}
      onMouseLeave={(e) => {
        if (!e.currentTarget.hasAttribute('data-highlighted')) {
          (e.currentTarget as HTMLDivElement).style.backgroundColor = '';
        }
      }}
      onFocus={(e) => {
        (e.currentTarget as HTMLDivElement).style.backgroundColor =
          'color-mix(in srgb, var(--accent-primary) 15%, var(--bg-elevated))';
      }}
      onBlur={(e) => {
        (e.currentTarget as HTMLDivElement).style.backgroundColor = '';
      }}
      {...props}
    >
      <RadixSelect.ItemText>{children}</RadixSelect.ItemText>
      <RadixSelect.ItemIndicator className="ml-2 shrink-0">
        <svg
          width="12"
          height="12"
          viewBox="0 0 16 16"
          fill="none"
          aria-hidden="true"
          style={{ color: 'var(--accent-primary)' }}
        >
          <path
            d="M3 8l4 4 6-7"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </RadixSelect.ItemIndicator>
    </RadixSelect.Item>
  );
});
SelectItem.displayName = 'SelectItem';

// ─── Group ───────────────────────────────────────────────────────────────────

export const SelectGroup = RadixSelect.Group;

// ─── Label ───────────────────────────────────────────────────────────────────

export const SelectLabel = forwardRef<
  HTMLDivElement,
  ComponentPropsWithoutRef<typeof RadixSelect.Label>
>(({ className = '', style, ...props }, ref) => {
  return (
    <RadixSelect.Label
      ref={ref}
      className={['px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em]', className]
        .filter(Boolean)
        .join(' ')}
      style={{ color: 'var(--text-tertiary)', ...style }}
      {...props}
    />
  );
});
SelectLabel.displayName = 'SelectLabel';

// ─── Separator ───────────────────────────────────────────────────────────────

export const SelectSeparator = forwardRef<
  HTMLDivElement,
  ComponentPropsWithoutRef<typeof RadixSelect.Separator>
>(({ className = '', style, ...props }, ref) => {
  return (
    <RadixSelect.Separator
      ref={ref}
      className={['my-1 mx-2 h-px', className].filter(Boolean).join(' ')}
      style={{ backgroundColor: 'var(--border-primary)', ...style }}
      {...props}
    />
  );
});
SelectSeparator.displayName = 'SelectSeparator';
