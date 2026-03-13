import { useModels } from '../hooks/useModels';
import { Select } from './ui';

interface ModelSelectorProps {
  currentModel: string;
  availableProviders: string[];
  onChange: (model: string) => void;
  disabled?: boolean;
  compact?: boolean;
}

export function ModelSelector({
  currentModel,
  availableProviders,
  onChange,
  disabled,
  compact = false,
}: ModelSelectorProps) {
  const { groupedByProvider, isLoading, fromCache, refreshModels } = useModels(availableProviders);

  const { anthropic: anthropicModels, openai: openaiModels } = groupedByProvider;
  const hasModels = anthropicModels.length > 0 || openaiModels.length > 0;

  // If no providers available, show nothing or disabled state
  if (!hasModels && !isLoading) {
    return (
      <span className="text-xs" style={{ color: 'var(--text-tertiary)', opacity: 0.5 }}>
        No API keys
      </span>
    );
  }

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: compact ? '6px' : '4px',
        minHeight: compact ? '32px' : undefined,
      }}
    >
      <Select
        value={currentModel}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled || isLoading}
        size="sm"
        className="model-selector font-semibold"
        style={{
          color: 'var(--text-primary)',
          width: compact ? 'min(180px, 42vw)' : 'auto',
          minWidth: compact ? '100px' : '120px',
          backgroundColor: compact ? 'var(--bg-elevated)' : 'var(--bg-tertiary)',
          border: '1px solid var(--border-secondary)',
          borderRadius: '4px',
          paddingRight: compact ? '1.5rem' : undefined,
          height: compact ? '32px' : undefined,
          boxShadow: compact
            ? 'inset -28px 0 0 rgba(255,255,255,0.04), inset -29px 0 0 var(--border-primary)'
            : undefined,
        }}
      >
        {anthropicModels.length > 0 && (
          <optgroup label="Anthropic">
            {anthropicModels.map((model) => (
              <option key={model.id} value={model.id}>
                {model.display_name}
              </option>
            ))}
          </optgroup>
        )}
        {openaiModels.length > 0 && (
          <optgroup label="OpenAI">
            {openaiModels.map((model) => (
              <option key={model.id} value={model.id}>
                {model.display_name}
              </option>
            ))}
          </optgroup>
        )}
      </Select>
      <button
        onClick={() => refreshModels()}
        disabled={isLoading}
        title={fromCache ? 'Refresh models (currently cached)' : 'Refresh models'}
        style={{
          background: 'none',
          border: 'none',
          cursor: isLoading ? 'wait' : 'pointer',
          padding: compact ? '0' : '2px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          opacity: isLoading ? 0.5 : 0.7,
          color: 'var(--text-tertiary)',
          width: compact ? '18px' : undefined,
          height: compact ? '18px' : undefined,
        }}
      >
        <svg
          width={compact ? '11' : '12'}
          height={compact ? '11' : '12'}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{
            animation: isLoading ? 'spin 1s linear infinite' : 'none',
          }}
        >
          <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
          <path d="M3 3v5h5" />
          <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
          <path d="M16 21h5v-5" />
        </svg>
      </button>
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .model-selector {
          transition: background-color 0.15s ease, border-color 0.15s ease;
        }
        .model-selector:hover:not(:disabled) {
          background-color: var(--bg-primary) !important;
          border-color: var(--border-secondary) !important;
        }
        .model-selector:focus {
          border-color: var(--accent-primary) !important;
          outline: none;
          box-shadow: 0 0 0 1px var(--accent-primary);
        }
      `}</style>
    </div>
  );
}
