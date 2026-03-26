import { useEffect } from 'react';
import { useModels } from '../hooks/useModels';
import {
  IconButton,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  SelectGroup,
  SelectLabel,
} from './ui';
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
      <Select value={currentModel} onValueChange={onChange} disabled={disabled || isLoading}>
        <SelectTrigger
          size="sm"
          style={{
            width: compact ? 'min(180px, 42vw)' : undefined,
            minWidth: compact ? '100px' : '120px',
          }}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {anthropicModels.length > 0 && (
            <SelectGroup>
              <SelectLabel>Anthropic</SelectLabel>
              {anthropicModels.map((model) => (
                <SelectItem key={model.id} value={model.id}>
                  {model.display_name}
                </SelectItem>
              ))}
            </SelectGroup>
          )}
          {anthropicModels.length > 0 && openaiModels.length > 0 && (
            <div className="my-1 mx-2 h-px" style={{ backgroundColor: 'var(--border-primary)' }} />
          )}
          {openaiModels.length > 0 && (
            <SelectGroup>
              <SelectLabel>OpenAI</SelectLabel>
              {openaiModels.map((model) => (
                <SelectItem key={model.id} value={model.id}>
                  {model.display_name}
                </SelectItem>
              ))}
            </SelectGroup>
          )}
        </SelectContent>
      </Select>

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
      `}</style>
    </div>
  );
}
