import { useEffect } from 'react';
import { useModels } from '../hooks/useModels';
import { IconButton, Select } from './ui';
import { notifyError } from '../utils/notifications';

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
  const { groupedByProvider, isLoading, error, fromCache, refreshModels } =
    useModels(availableProviders);

  const { anthropic: anthropicModels, openai: openaiModels } = groupedByProvider;
  const hasModels = anthropicModels.length > 0 || openaiModels.length > 0;

  useEffect(() => {
    if (!error) return;

    notifyError({
      operation: 'refresh-models',
      error,
      fallbackMessage: 'Failed to refresh models',
      toastId: 'refresh-models-error',
    });
  }, [error]);

  // If no providers available, show nothing or disabled state
  if (!hasModels && !isLoading) {
    return (
      <span className="text-xs" style={{ color: 'var(--text-tertiary)', opacity: 0.5 }}>
        No API keys
      </span>
    );
  }

  const selectControl = (
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
        backgroundImage: compact ? 'none' : undefined,
        border: '1px solid var(--border-secondary)',
        borderRadius: '4px',
        paddingRight: compact ? '2.5rem' : undefined,
        height: compact ? '32px' : undefined,
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
  );

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: compact ? '6px' : '4px',
        minHeight: compact ? '32px' : undefined,
      }}
    >
      {compact ? (
        <div
          style={{
            position: 'relative',
            display: 'flex',
            alignItems: 'stretch',
          }}
        >
          {selectControl}
          <div
            aria-hidden="true"
            style={{
              position: 'absolute',
              top: '1px',
              right: '1px',
              bottom: '1px',
              width: '28px',
              borderLeft: '1px solid var(--border-primary)',
              borderTopRightRadius: '3px',
              borderBottomRightRadius: '3px',
              backgroundColor: 'rgba(255,255,255,0.04)',
              pointerEvents: 'none',
            }}
          />
          <svg
            aria-hidden="true"
            width="12"
            height="12"
            viewBox="0 0 16 16"
            fill="none"
            style={{
              position: 'absolute',
              top: '50%',
              right: '8px',
              transform: 'translateY(-50%)',
              pointerEvents: 'none',
              color: 'var(--text-secondary)',
            }}
          >
            <path
              d="M4 6L8 10L12 6"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      ) : (
        selectControl
      )}
      {!compact && (
        <IconButton
          size="sm"
          onClick={() => refreshModels()}
          disabled={isLoading}
          title={fromCache ? 'Refresh models (currently cached)' : 'Refresh models'}
          style={{ opacity: isLoading ? 0.5 : 0.7, cursor: isLoading ? 'wait' : 'pointer' }}
        >
          <svg
            width="12"
            height="12"
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
        </IconButton>
      )}
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
