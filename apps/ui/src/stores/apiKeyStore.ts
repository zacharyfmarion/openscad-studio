import { useSyncExternalStore } from 'react';
import { DEFAULT_MODEL_IDS, getPreferredDefaultModel } from '../utils/aiModels';

// ============================================================================
// Constants
// ============================================================================

const STORAGE_KEYS = {
  anthropic: 'openscad_studio_anthropic_api_key',
  openai: 'openscad_studio_openai_api_key',
  openaiCompatibleApiKey: 'openscad_studio_openai_compatible_api_key',
  openaiCompatibleBaseUrl: 'openscad_studio_openai_compatible_base_url',
  openaiCompatibleModel: 'openscad_studio_openai_compatible_model',
  model: 'openscad_studio_ai_model',
  modelSelection: 'openscad_studio_ai_model_selection',
} as const;

export type AiProvider = 'anthropic' | 'openai' | 'openai-compatible';

export interface AiModelSelection {
  provider: AiProvider;
  modelId: string;
}

export interface OpenAiCompatibleConfig {
  baseUrl: string;
  modelId: string;
  apiKey: string | null;
}

interface ApiKeySnapshot {
  availableProviders: AiProvider[];
  hasAnyKey: boolean;
}

export const DEFAULT_OPENAI_COMPATIBLE_BASE_URL = 'http://127.0.0.1:11434/v1';

const API_KEY_STORAGE_KEYS: Record<AiProvider, string> = {
  anthropic: STORAGE_KEYS.anthropic,
  openai: STORAGE_KEYS.openai,
  'openai-compatible': STORAGE_KEYS.openaiCompatibleApiKey,
};

// ============================================================================
// API Key Storage (localStorage-based, obfuscated)
// ============================================================================

const OBF_PREFIX = 'obf1:';

function obfuscate(key: string): string {
  return OBF_PREFIX + btoa(key.split('').reverse().join(''));
}

function deobfuscate(stored: string): string | null {
  if (!stored.startsWith(OBF_PREFIX)) return null; // Legacy plaintext value
  try {
    return atob(stored.slice(OBF_PREFIX.length)).split('').reverse().join('');
  } catch {
    return null; // Corrupt stored value
  }
}

export function storeApiKey(provider: AiProvider, key: string): void {
  localStorage.setItem(API_KEY_STORAGE_KEYS[provider], obfuscate(key));
  notify();
}

export function clearApiKey(provider: AiProvider): void {
  localStorage.removeItem(API_KEY_STORAGE_KEYS[provider]);
  notify();
}

export function getApiKey(provider: AiProvider): string | null {
  const stored = localStorage.getItem(API_KEY_STORAGE_KEYS[provider]);
  if (stored === null) return null;

  const decoded = deobfuscate(stored);
  if (decoded !== null) return decoded;

  // Legacy plaintext value — re-encode so storage is clean going forward
  localStorage.setItem(API_KEY_STORAGE_KEYS[provider], obfuscate(stored));
  return stored;
}

export function hasApiKeyForProvider(provider: AiProvider): boolean {
  const key = getApiKey(provider);
  return key !== null && key.length > 0;
}

export function normalizeOpenAiCompatibleBaseUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, '');
}

export function getOpenAiCompatibleConfig(): OpenAiCompatibleConfig {
  const storedBaseUrl = normalizeOpenAiCompatibleBaseUrl(
    localStorage.getItem(STORAGE_KEYS.openaiCompatibleBaseUrl) ?? ''
  );
  const baseUrl =
    storedBaseUrl ||
    normalizeOpenAiCompatibleBaseUrl(DEFAULT_OPENAI_COMPATIBLE_BASE_URL) ||
    DEFAULT_OPENAI_COMPATIBLE_BASE_URL;
  const modelId = (localStorage.getItem(STORAGE_KEYS.openaiCompatibleModel) ?? '').trim();
  return {
    baseUrl,
    modelId,
    apiKey: getApiKey('openai-compatible'),
  };
}

export function storeOpenAiCompatibleConfig(config: OpenAiCompatibleConfig): void {
  const baseUrl = normalizeOpenAiCompatibleBaseUrl(config.baseUrl);
  const modelId = config.modelId.trim();

  if (baseUrl) {
    localStorage.setItem(STORAGE_KEYS.openaiCompatibleBaseUrl, baseUrl);
  } else {
    localStorage.removeItem(STORAGE_KEYS.openaiCompatibleBaseUrl);
  }

  if (modelId) {
    localStorage.setItem(STORAGE_KEYS.openaiCompatibleModel, modelId);
  } else {
    localStorage.removeItem(STORAGE_KEYS.openaiCompatibleModel);
  }

  if (config.apiKey?.trim()) {
    localStorage.setItem(STORAGE_KEYS.openaiCompatibleApiKey, obfuscate(config.apiKey.trim()));
  } else {
    localStorage.removeItem(STORAGE_KEYS.openaiCompatibleApiKey);
  }

  notify();
}

export function clearOpenAiCompatibleConfig(): void {
  localStorage.removeItem(STORAGE_KEYS.openaiCompatibleBaseUrl);
  localStorage.removeItem(STORAGE_KEYS.openaiCompatibleModel);
  localStorage.removeItem(STORAGE_KEYS.openaiCompatibleApiKey);
  clearStoredModelSelectionForProvider('openai-compatible');
  notify();
}

export function hasOpenAiCompatibleConfig(): boolean {
  const storedBaseUrl = normalizeOpenAiCompatibleBaseUrl(
    localStorage.getItem(STORAGE_KEYS.openaiCompatibleBaseUrl) ?? ''
  );
  return storedBaseUrl.length > 0;
}

export function isProviderConfigured(provider: AiProvider): boolean {
  if (provider === 'openai-compatible') {
    return hasOpenAiCompatibleConfig();
  }
  return hasApiKeyForProvider(provider);
}

export function getAvailableProviders(): AiProvider[] {
  const providers: AiProvider[] = [];
  if (isProviderConfigured('anthropic')) providers.push('anthropic');
  if (isProviderConfigured('openai')) providers.push('openai');
  if (isProviderConfigured('openai-compatible')) providers.push('openai-compatible');
  return providers;
}

// ============================================================================
// Model Persistence
// ============================================================================

export function getStoredModel(): string {
  return getStoredModelSelection().modelId;
}

export function setStoredModel(model: string): void {
  setStoredModelSelection({
    provider: getProviderFromModel(model),
    modelId: model,
  });
}

export function getPreferredDefaultModelSelection(providers: readonly string[]): AiModelSelection {
  if (providers.includes('anthropic')) {
    return { provider: 'anthropic', modelId: getPreferredDefaultModel(['anthropic']) };
  }
  if (providers.includes('openai')) {
    return { provider: 'openai', modelId: getPreferredDefaultModel(['openai']) };
  }
  if (providers.includes('openai-compatible')) {
    const config = getOpenAiCompatibleConfig();
    return {
      provider: 'openai-compatible',
      modelId: config.modelId || DEFAULT_MODEL_IDS['openai-compatible'],
    };
  }
  return { provider: 'anthropic', modelId: getPreferredDefaultModel(['anthropic']) };
}

function isAiProvider(value: unknown): value is AiProvider {
  return value === 'anthropic' || value === 'openai' || value === 'openai-compatible';
}

function parseStoredModelSelection(raw: string | null): AiModelSelection | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<AiModelSelection>;
    if (isAiProvider(parsed.provider) && typeof parsed.modelId === 'string') {
      const modelId = parsed.modelId.trim();
      if (modelId) {
        return { provider: parsed.provider, modelId };
      }
    }
  } catch {
    return null;
  }
  return null;
}

function getProviderFromKnownModelPrefix(modelId: string): AiProvider | null {
  if (modelId.startsWith('claude') || modelId.startsWith('anthropic')) {
    return 'anthropic';
  }
  if (
    modelId.startsWith('gpt') ||
    modelId.startsWith('o1') ||
    modelId.startsWith('o3') ||
    modelId.startsWith('chatgpt')
  ) {
    return 'openai';
  }
  return null;
}

export function getStoredModelSelection(): AiModelSelection {
  const storedSelection = parseStoredModelSelection(
    localStorage.getItem(STORAGE_KEYS.modelSelection)
  );
  if (storedSelection) return storedSelection;

  const legacyModel = localStorage.getItem(STORAGE_KEYS.model);
  if (legacyModel?.trim()) {
    const modelId = legacyModel.trim();
    const provider = getProviderFromKnownModelPrefix(modelId);
    if (provider) {
      return { provider, modelId };
    }
  }

  const availableProviders = getAvailableProviders();
  return getPreferredDefaultModelSelection(availableProviders);
}

export function setStoredModelSelection(selection: AiModelSelection): void {
  const modelId = selection.modelId.trim();
  if (!modelId) return;
  localStorage.setItem(
    STORAGE_KEYS.modelSelection,
    JSON.stringify({ provider: selection.provider, modelId } satisfies AiModelSelection)
  );
  // Keep the legacy string key updated for analytics and older callers during migration.
  localStorage.setItem(STORAGE_KEYS.model, modelId);
}

export function clearStoredModelSelectionForProvider(provider: AiProvider): void {
  const storedSelection = parseStoredModelSelection(
    localStorage.getItem(STORAGE_KEYS.modelSelection)
  );
  if (storedSelection?.provider !== provider) return;
  localStorage.removeItem(STORAGE_KEYS.modelSelection);
  localStorage.removeItem(STORAGE_KEYS.model);
}

// ============================================================================
// Provider Detection
// ============================================================================

export function getProviderFromModel(modelId: string): AiProvider {
  const provider = getProviderFromKnownModelPrefix(modelId);
  if (provider) return provider;
  return 'anthropic'; // Default
}

function createSnapshot(): ApiKeySnapshot {
  const availableProviders = getAvailableProviders();
  return {
    availableProviders,
    hasAnyKey: availableProviders.length > 0,
  };
}

// ============================================================================
// Reactive Store (useSyncExternalStore)
// ============================================================================

let snapshot = createSnapshot();
const listeners: Set<() => void> = new Set();

function notify() {
  snapshot = createSnapshot();
  for (const listener of listeners) {
    listener();
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): ApiKeySnapshot {
  return snapshot;
}

export function invalidateApiKeyStatus() {
  notify();
}

export function useAvailableProviders(): AiProvider[] {
  return useSyncExternalStore(subscribe, getSnapshot).availableProviders;
}

export function useHasApiKey(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot).hasAnyKey;
}
