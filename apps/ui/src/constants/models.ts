/**
 * Centralized AI Model Definitions
 *
 * Shared between Settings Dialog and Chat UI
 */

export interface ModelDefinition {
  value: string;
  label: string;
  provider: 'anthropic' | 'openai';
}

export const ANTHROPIC_MODELS: ModelDefinition[] = [
  { value: 'claude-sonnet-4-5-20250929', label: 'Claude Sonnet 4.5', provider: 'anthropic' },
  { value: 'claude-opus-4-1-20250805', label: 'Claude Opus 4.1', provider: 'anthropic' },
  { value: 'claude-3-5-haiku-20241022', label: 'Claude 3.5 Haiku', provider: 'anthropic' },
  { value: 'claude-3-5-sonnet-20241022', label: 'Claude 3.5 Sonnet (Oct)', provider: 'anthropic' },
  { value: 'claude-3-5-sonnet-20240620', label: 'Claude 3.5 Sonnet (Jun)', provider: 'anthropic' },
  { value: 'claude-3-opus-20240229', label: 'Claude 3 Opus', provider: 'anthropic' },
];

export const OPENAI_MODELS: ModelDefinition[] = [
  { value: 'gpt-5', label: 'GPT-5', provider: 'openai' },
  { value: 'gpt-5-pro', label: 'GPT-5 Pro', provider: 'openai' },
  { value: 'gpt-5-mini', label: 'GPT-5 Mini', provider: 'openai' },
  { value: 'gpt-4.1', label: 'GPT-4.1', provider: 'openai' },
];

export const ALL_MODELS: ModelDefinition[] = [
  ...ANTHROPIC_MODELS,
  ...OPENAI_MODELS,
];

/**
 * Get models for a specific provider
 */
export function getModelsForProvider(provider: 'anthropic' | 'openai'): ModelDefinition[] {
  return provider === 'anthropic' ? ANTHROPIC_MODELS : OPENAI_MODELS;
}

/**
 * Get models for multiple providers
 */
export function getModelsForProviders(providers: string[]): ModelDefinition[] {
  return ALL_MODELS.filter(model => providers.includes(model.provider));
}

/**
 * Get model display label from value
 */
export function getModelLabel(value: string): string {
  const model = ALL_MODELS.find(m => m.value === value);
  return model?.label || value;
}

/**
 * Get provider from model value
 */
export function getProviderFromModel(value: string): 'anthropic' | 'openai' | null {
  const model = ALL_MODELS.find(m => m.value === value);
  return model?.provider || null;
}
