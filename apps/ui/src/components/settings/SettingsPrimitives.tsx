import type { CSSProperties, HTMLAttributes, ReactNode } from 'react';
import { Label, SegmentedControl, Text } from '../ui';

const CARD_STYLE: CSSProperties = {
  backgroundColor: 'var(--bg-primary)',
  border: '1px solid var(--border-primary)',
};

const HEADER_STYLE: CSSProperties = {
  borderBottom: '1px solid var(--border-primary)',
};

const DIVIDER_STYLE: CSSProperties = {
  borderTop: '1px solid var(--border-primary)',
};

const PADDED_SECTION_STYLE: CSSProperties = {
  padding: 'var(--space-field-gap)',
};

const SUPPORT_BLOCK_STYLE: CSSProperties = {
  backgroundColor: 'var(--bg-secondary)',
  border: '1px solid var(--border-primary)',
  borderRadius: 'var(--radius-md)',
  padding: 'var(--space-3)',
};

interface SettingsCardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

export function SettingsCard({ children, className = '', style, ...props }: SettingsCardProps) {
  return (
    <div
      className={`rounded-xl overflow-hidden ${className}`.trim()}
      style={{ ...CARD_STYLE, ...style }}
      {...props}
    >
      {children}
    </div>
  );
}

interface SettingsCardHeaderProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
}

export function SettingsCardHeader({
  title,
  description,
  action,
  className = '',
  style,
  ...props
}: SettingsCardHeaderProps) {
  return (
    <div
      className={`flex items-center justify-between ${className}`.trim()}
      style={{
        ...HEADER_STYLE,
        gap: 'var(--space-helper-gap)',
        padding: 'var(--space-field-gap)',
        ...style,
      }}
      {...props}
    >
      <div className="pr-4 flex flex-col" style={{ gap: 'var(--space-helper-gap)' }}>
        <Text variant="section-heading">{title}</Text>
        {description ? (
          <Text variant="caption" color="accent">
            {description}
          </Text>
        ) : null}
      </div>
      {action}
    </div>
  );
}

interface SettingsCardSectionProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  divided?: boolean;
  padded?: boolean;
}

export function SettingsCardSection({
  children,
  divided = false,
  padded = true,
  className = '',
  style,
  ...props
}: SettingsCardSectionProps) {
  return (
    <div
      className={className}
      style={{
        ...(divided ? DIVIDER_STYLE : null),
        ...(padded ? PADDED_SECTION_STYLE : null),
        ...style,
      }}
      {...props}
    >
      {children}
    </div>
  );
}

interface SettingsControlRowProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  label: ReactNode;
  description?: ReactNode;
  control?: ReactNode;
  htmlFor?: string;
  divided?: boolean;
  align?: 'start' | 'center';
}

export function SettingsControlRow({
  label,
  description,
  control,
  htmlFor,
  divided = false,
  align = 'center',
  className = '',
  style,
  ...props
}: SettingsControlRowProps) {
  return (
    <SettingsCardSection
      divided={divided}
      className={`flex justify-between ${align === 'start' ? 'items-start' : 'items-center'} ${className}`.trim()}
      style={{ gap: 'var(--space-control-gap)', ...style }}
      {...props}
    >
      <div className="pr-4 flex flex-col" style={{ gap: 'var(--space-helper-gap)' }}>
        <Label htmlFor={htmlFor} className="mb-0">
          {label}
        </Label>
        {description ? (
          <Text variant="caption" color="tertiary">
            {description}
          </Text>
        ) : null}
      </div>
      {control}
    </SettingsCardSection>
  );
}

interface SettingsSubsectionLabelProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

export function SettingsSubsectionLabel({
  children,
  className = '',
  style,
  ...props
}: SettingsSubsectionLabelProps) {
  return (
    <Text
      as="div"
      variant="caption"
      {...props}
      color="tertiary"
      className={`font-semibold uppercase tracking-[0.18em] ${className}`.trim()}
      style={style}
    >
      {children}
    </Text>
  );
}

interface SettingsSupportBlockProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

export function SettingsSupportBlock({
  children,
  className = '',
  style,
  ...props
}: SettingsSupportBlockProps) {
  return (
    <div
      className={`rounded-lg ${className}`.trim()}
      style={{ ...SUPPORT_BLOCK_STYLE, ...style }}
      {...props}
    >
      {children}
    </div>
  );
}

interface SettingsSubtabOption<T extends string> {
  value: T;
  label: string;
  title?: string;
  testId?: string;
}

interface SettingsSubtabsProps<T extends string> {
  options: SettingsSubtabOption<T>[];
  value: T;
  onChange: (value: T) => void;
  'aria-label'?: string;
}

export function SettingsSubtabs<T extends string>({
  options,
  value,
  onChange,
  'aria-label': ariaLabel,
}: SettingsSubtabsProps<T>) {
  return (
    <SegmentedControl
      size="sm"
      options={options}
      value={value}
      onChange={onChange}
      aria-label={ariaLabel}
    />
  );
}
