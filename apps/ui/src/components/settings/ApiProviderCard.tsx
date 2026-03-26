import { IconButton, Input, Text } from '../ui';
import { SettingsCard, SettingsCardHeader, SettingsCardSection } from './SettingsPrimitives';

const TRASH_ICON = (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <title>Delete</title>
    <path
      d="M2 4h12M5.333 4V2.667a.667.667 0 01.667-.667h4a.667.667 0 01.667.667V4m2 0v9.333a.667.667 0 01-.667.667H4a.667.667 0 01-.667-.667V4h9.334z"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export interface ApiProviderCardProps {
  title: string;
  description: string;
  placeholder: string;
  keyLink: { label: string; href: string };
  /** Whether this provider's input field is the active/focused one */
  isActive: boolean;
  hasKey: boolean;
  /** The shared api key value (only shown when isActive) */
  apiKey: string;
  showKey: boolean;
  isLoading: boolean;
  onFocus: () => void;
  onChange: (value: string) => void;
  onToggleShow: () => void;
  onClear: () => void;
}

export function ApiProviderCard({
  title,
  description,
  placeholder,
  keyLink,
  isActive,
  hasKey,
  apiKey,
  showKey,
  isLoading,
  onFocus,
  onChange,
  onToggleShow,
  onClear,
}: ApiProviderCardProps) {
  const statusStyle = {
    backgroundColor: hasKey ? 'rgba(133, 153, 0, 0.15)' : 'rgba(128, 128, 128, 0.1)',
    color: hasKey ? 'var(--color-success)' : 'var(--text-tertiary)',
  };

  const displayValue = isActive ? apiKey : '';
  const inputType = showKey && isActive ? 'text' : 'password';
  const showToggleVisible = isActive && apiKey && !apiKey.startsWith('•');

  return (
    <SettingsCard className="ph-no-capture">
      <SettingsCardHeader
        title={title}
        description={description}
        action={
          <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={statusStyle}>
            {hasKey ? 'Configured' : 'Not configured'}
          </span>
        }
      />
      <SettingsCardSection className="flex flex-col" style={{ gap: 'var(--space-field-gap)' }}>
        <div className="flex items-center" style={{ gap: 'var(--space-control-gap)' }}>
          <div className="relative flex-1">
            <Input
              type={inputType}
              value={displayValue}
              onChange={(e) => onChange(e.target.value)}
              onFocus={onFocus}
              placeholder={placeholder}
              className="pr-20 font-mono text-sm ph-no-capture"
              disabled={isLoading}
            />
            {showToggleVisible ? (
              // eslint-disable-next-line no-restricted-syntax -- absolute-positioned inline toggle overlay on a password input; no Button size fits the 20px height in this context
              <button
                type="button"
                onClick={onToggleShow}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-xs px-2 py-1 rounded-lg transition-colors"
                style={{ color: 'var(--text-secondary)' }}
              >
                {showKey ? 'Hide' : 'Show'}
              </button>
            ) : null}
          </div>
          <IconButton
            type="button"
            size="md"
            onClick={onClear}
            disabled={isLoading || !hasKey}
            className="shrink-0"
            style={{
              border: '1px solid var(--border-primary)',
              color: hasKey && !isLoading ? 'var(--color-error)' : 'var(--text-tertiary)',
              opacity: hasKey && !isLoading ? 1 : 0.4,
            }}
            title={hasKey ? 'Remove API key' : 'No API key to remove'}
          >
            {TRASH_ICON}
          </IconButton>
        </div>
        <Text variant="caption" color="tertiary">
          Don't have a key?{' '}
          <a
            href={keyLink.href}
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
            style={{ color: 'var(--accent-primary)' }}
          >
            {keyLink.label}
          </a>
        </Text>
      </SettingsCardSection>
    </SettingsCard>
  );
}
