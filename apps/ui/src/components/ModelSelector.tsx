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
import { getProviderFromModel, type AiProvider } from '../stores/apiKeyStore';

interface ModelSelectorProps {
  currentModel: string;
  currentProvider?: AiProvider;
  availableProviders: AiProvider[];
  onChange: (model: string, provider: AiProvider) => void;
  disabled?: boolean;
  compact?: boolean;
}

function encodeModelValue(provider: AiProvider, modelId: string): string {
  return JSON.stringify([provider, modelId]);
}

function decodeModelValue(value: string): { provider: AiProvider; modelId: string } {
  try {
    const parsed = JSON.parse(value);
    if (
      Array.isArray(parsed) &&
      (parsed[0] === 'anthropic' || parsed[0] === 'openai' || parsed[0] === 'openai-compatible') &&
      typeof parsed[1] === 'string'
    ) {
      return { provider: parsed[0], modelId: parsed[1] };
    }
  } catch {
    // Legacy select values were bare model ids.
  }
  return { provider: getProviderFromModel(value), modelId: value };
}

export function ModelSelector({
  currentModel,
  currentProvider,
  availableProviders,
  onChange,
  disabled,
  compact = false,
}: ModelSelectorProps) {
  const { groupedByProvider, isLoading, error, fromCache, refreshModels } =
    useModels(availableProviders);

  const {
    anthropic: anthropicModels,
    openai: openaiModels,
    openaiCompatible: openAiCompatibleModels,
  } = groupedByProvider;
  const hasModels =
    anthropicModels.length > 0 || openaiModels.length > 0 || openAiCompatibleModels.length > 0;
  const selectedProvider = currentProvider ?? getProviderFromModel(currentModel);
  const selectedValue = encodeModelValue(selectedProvider, currentModel);

  useEffect(() => {
    if (!error) return;

    notifyError({
      operation: 'refresh-models',
      error,
      fallbackMessage: 'Failed to refresh models',
      toastId: 'refresh-models-error',
    });
  }, [error]);

  useEffect(() => {
    if (
      disabled ||
      isLoading ||
      selectedProvider !== 'openai-compatible' ||
      openAiCompatibleModels.length === 0 ||
      openAiCompatibleModels.some((model) => model.id === currentModel)
    ) {
      return;
    }

    onChange(openAiCompatibleModels[0].id, 'openai-compatible');
  }, [currentModel, disabled, isLoading, onChange, openAiCompatibleModels, selectedProvider]);

  if (!hasModels && !isLoading) {
    return (
      <span className="text-xs" style={{ color: 'var(--text-tertiary)', opacity: 0.5 }}>
        No AI provider configured
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
        value={selectedValue}
        onValueChange={(value) => {
          const selection = decodeModelValue(value);
          onChange(selection.modelId, selection.provider);
        }}
        disabled={disabled || isLoading}
      >
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
                <SelectItem
                  key={`${model.provider}:${model.id}`}
                  value={encodeModelValue(model.provider, model.id)}
                >
                  {model.display_name}
                </SelectItem>
              ))}
            </SelectGroup>
          )}
          {anthropicModels.length > 0 &&
            (openaiModels.length > 0 || openAiCompatibleModels.length > 0) && (
              <div
                className="my-1 mx-2 h-px"
                style={{ backgroundColor: 'var(--border-primary)' }}
              />
            )}
          {openaiModels.length > 0 && (
            <SelectGroup>
              <SelectLabel>OpenAI</SelectLabel>
              {openaiModels.map((model) => (
                <SelectItem
                  key={`${model.provider}:${model.id}`}
                  value={encodeModelValue(model.provider, model.id)}
                >
                  {model.display_name}
                </SelectItem>
              ))}
            </SelectGroup>
          )}
          {openaiModels.length > 0 && openAiCompatibleModels.length > 0 && (
            <div className="my-1 mx-2 h-px" style={{ backgroundColor: 'var(--border-primary)' }} />
          )}
          {openAiCompatibleModels.length > 0 && (
            <SelectGroup>
              <SelectLabel>OpenAI-compatible</SelectLabel>
              {openAiCompatibleModels.map((model) => (
                <SelectItem
                  key={`${model.provider}:${model.id}`}
                  value={encodeModelValue(model.provider, model.id)}
                >
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
