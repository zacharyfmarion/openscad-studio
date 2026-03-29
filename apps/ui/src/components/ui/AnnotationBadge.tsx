import type { CSSProperties, HTMLAttributes } from 'react';

export interface AnnotationBadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: 'accent' | 'neutral';
}

const TONE_STYLES: Record<NonNullable<AnnotationBadgeProps['tone']>, CSSProperties> = {
  accent: {
    backgroundColor: 'color-mix(in srgb, var(--accent-primary) 18%, var(--bg-secondary))',
    borderColor: 'color-mix(in srgb, var(--accent-primary) 44%, var(--border-primary))',
    color: 'var(--accent-primary)',
  },
  neutral: {
    backgroundColor: 'var(--bg-tertiary)',
    borderColor: 'var(--border-primary)',
    color: 'var(--text-secondary)',
  },
};

export function AnnotationBadge({
  tone = 'accent',
  className = '',
  style,
  children,
  ...props
}: AnnotationBadgeProps) {
  return (
    <span
      data-tone={tone}
      className={[
        'inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-semibold uppercase leading-none tracking-[0.18em]',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      style={{ ...TONE_STYLES[tone], ...style }}
      {...props}
    >
      {children}
    </span>
  );
}
