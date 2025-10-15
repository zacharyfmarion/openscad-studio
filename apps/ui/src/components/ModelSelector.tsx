import { getModelsForProviders } from '../constants/models';

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
    <select
      value={currentModel}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className="text-xs bg-transparent border-none cursor-pointer"
      style={{
        color: 'var(--text-secondary)',
        padding: '0 4px',
        appearance: 'none',
        WebkitAppearance: 'none',
        MozAppearance: 'none',
        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23888' d='M6 8L3 5h6z'/%3E%3C/svg%3E")`,
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'right center',
        paddingRight: '16px',
        opacity: disabled ? 0.5 : 1,
        fontWeight: 600,
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
    </select>
  );
}
