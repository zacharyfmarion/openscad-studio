import { forwardRef, type ComponentPropsWithoutRef } from 'react';
import * as RadixTooltip from '@radix-ui/react-tooltip';

// ─── Provider ────────────────────────────────────────────────────────────────

export interface TooltipProviderProps extends ComponentPropsWithoutRef<
  typeof RadixTooltip.Provider
> {}

export const TooltipProvider = ({ delayDuration = 600, ...props }: TooltipProviderProps) => (
  <RadixTooltip.Provider delayDuration={delayDuration} {...props} />
);

// ─── Root ─────────────────────────────────────────────────────────────────────

export const Tooltip = RadixTooltip.Root;

// ─── Trigger ─────────────────────────────────────────────────────────────────

export const TooltipTrigger = RadixTooltip.Trigger;

// ─── Content ─────────────────────────────────────────────────────────────────

export const TooltipContent = forwardRef<
  HTMLDivElement,
  ComponentPropsWithoutRef<typeof RadixTooltip.Content>
>(({ className = '', style, children, sideOffset = 6, ...props }, ref) => {
  return (
    <RadixTooltip.Portal>
      <RadixTooltip.Content
        ref={ref}
        sideOffset={sideOffset}
        className={['select-none', className].filter(Boolean).join(' ')}
        style={{
          backgroundColor: 'var(--bg-elevated)',
          color: 'var(--text-primary)',
          border: '1px solid var(--border-secondary)',
          borderRadius: 'var(--radius-md)',
          boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
          fontSize: '12px',
          lineHeight: '1.4',
          padding: '4px 8px',
          zIndex: 9999,
          maxWidth: '240px',
          ...style,
        }}
        {...props}
      >
        {children}
        <RadixTooltip.Arrow
          style={{
            fill: 'var(--bg-elevated)',
            filter: 'drop-shadow(0 1px 0 var(--border-secondary))',
          }}
          width={10}
          height={5}
        />
      </RadixTooltip.Content>
    </RadixTooltip.Portal>
  );
});
TooltipContent.displayName = 'TooltipContent';
