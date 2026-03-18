import { type ElementType, forwardRef, type HTMLAttributes } from 'react';

export type TextVariant =
  | 'page-heading'
  | 'panel-title'
  | 'section-heading'
  | 'overline'
  | 'body'
  | 'caption';

export type TextColor =
  | 'primary'
  | 'secondary'
  | 'tertiary'
  | 'inverse'
  | 'error'
  | 'warning'
  | 'success'
  | 'info'
  | 'accent';

export type TextWeight = 'normal' | 'medium' | 'semibold' | 'bold';

export interface TextProps extends HTMLAttributes<HTMLElement> {
  variant?: TextVariant;
  color?: TextColor;
  weight?: TextWeight;
  as?: ElementType;
}

const variantConfig: Record<
  TextVariant,
  { element: ElementType; className: string; color: TextColor }
> = {
  'page-heading': { element: 'h1', className: 'text-4xl font-bold', color: 'primary' },
  'panel-title': { element: 'h2', className: 'text-lg font-semibold', color: 'primary' },
  'section-heading': { element: 'h3', className: 'text-sm font-semibold', color: 'primary' },
  overline: {
    element: 'div',
    className: 'text-[11px] font-semibold uppercase tracking-[0.12em]',
    color: 'secondary',
  },
  body: { element: 'p', className: 'text-sm', color: 'secondary' },
  caption: { element: 'p', className: 'text-xs', color: 'secondary' },
};

const colorVar: Record<TextColor, string> = {
  primary: 'var(--text-primary)',
  secondary: 'var(--text-secondary)',
  tertiary: 'var(--text-tertiary)',
  inverse: 'var(--text-inverse)',
  error: 'var(--color-error)',
  warning: 'var(--color-warning)',
  success: 'var(--color-success)',
  info: 'var(--color-info)',
  accent: 'var(--accent-primary)',
};

const weightClass: Record<TextWeight, string> = {
  normal: 'font-normal',
  medium: 'font-medium',
  semibold: 'font-semibold',
  bold: 'font-bold',
};

export const Text = forwardRef<HTMLElement, TextProps>(
  ({ variant = 'body', color, weight, as, className = '', style, ...props }, ref) => {
    const config = variantConfig[variant];
    const Tag = as ?? config.element;
    const resolvedColor = color ?? config.color;
    const colorStyle = { color: colorVar[resolvedColor] };
    const weightOverride = weight ? weightClass[weight] : '';

    return (
      <Tag
        // ref cast as never: forwardRef is not polymorphic in TypeScript — the ref type is fixed
        // to HTMLElement but `as` can render any element type. Safe at runtime because the
        // forwarded ref is always a DOM element regardless of tag.
        ref={ref as never}
        className={`${config.className}${weightOverride ? ` ${weightOverride}` : ''}${className ? ` ${className}` : ''}`}
        style={{ ...colorStyle, ...style }}
        {...props}
      />
    );
  }
);

Text.displayName = 'Text';
