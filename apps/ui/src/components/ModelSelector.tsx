import { getModelsForProviders } from '../constants/models';
import { Select } from './ui';

interface ModelSelectorProps {
  currentModel: string;
  availableProviders: string[];
  onChange: (model: string) => void;
  disabled?: boolean;
}

export function ModelSelector({ currentModel, availableProviders, onChange, disabled }: ModelSelectorProps) {
  // Get all models for providers with API keys
  const availableModels = getModelsForProviders(availableProviders);

  // Group models by provider for better organization
  const anthropicModels = availableModels.filter(m => m.provider === 'anthropic');
  const openaiModels = availableModels.filter(m => m.provider === 'openai');

  // If no providers available, show nothing or disabled state
  if (availableModels.length === 0) {
    return (
      <span className="text-xs" style={{ color: 'var(--text-tertiary)', opacity: 0.5 }}>
        No API keys
      </span>
    );
  }

  return (
    <Select
      value={currentModel}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      size="sm"
      className="border-none bg-transparent font-semibold"
      style={{
        color: 'var(--text-secondary)',
        width: 'auto',
        minWidth: '120px',
      }}
    >
      {anthropicModels.length > 0 && (
        <optgroup label="Anthropic">
          {anthropicModels.map((model) => (
            <option key={model.value} value={model.value}>
              {model.label}
            </option>
          ))}
        </optgroup>
      )}
      {openaiModels.length > 0 && (
        <optgroup label="OpenAI">
          {openaiModels.map((model) => (
            <option key={model.value} value={model.value}>
              {model.label}
            </option>
          ))}
        </optgroup>
      )}
    </Select>
  );
}
