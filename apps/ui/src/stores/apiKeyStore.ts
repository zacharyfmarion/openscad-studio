import { useSyncExternalStore } from 'react';
import { getPreferredDefaultModel } from '../utils/aiModels';

// ============================================================================
// Constants
// ============================================================================

const STORAGE_KEYS = {
  anthropic: 'openscad_studio_anthropic_api_key',
  openai: 'openscad_studio_openai_api_key',
  model: 'openscad_studio_ai_model',
} as const;

export type AiProvider = 'anthropic' | 'openai';

interface ApiKeySnapshot {
  availableProviders: AiProvider[];
  hasAnyKey: boolean;
}

// ============================================================================
// API Key Storage (localStorage-based, obfuscated)
// ============================================================================

function obfuscate(key: string): string {
  return btoa(key.split('').reverse().join(''));
}

function deobfuscate(stored: string): string | null {
  try {
    return atob(stored).split('').reverse().join('');
  } catch {
    // Not valid base64 — this is a legacy plaintext value
    return null;
  }
}

export function storeApiKey(provider: AiProvider, key: string): void {
  localStorage.setItem(STORAGE_KEYS[provider], obfuscate(key));
  notify();
}

export function clearApiKey(provider: AiProvider): void {
  localStorage.removeItem(STORAGE_KEYS[provider]);
  notify();
}

export function getApiKey(provider: AiProvider): string | null {
  const stored = localStorage.getItem(STORAGE_KEYS[provider]);
  if (stored === null) return null;

  const decoded = deobfuscate(stored);
  if (decoded !== null) return decoded;

  // Legacy plaintext value — re-encode so storage is clean going forward
  localStorage.setItem(STORAGE_KEYS[provider], obfuscate(stored));
  return stored;
}

export function hasApiKeyForProvider(provider: AiProvider): boolean {
  const key = getApiKey(provider);
  return key !== null && key.length > 0;
}

export function getAvailableProviders(): AiProvider[] {
  const providers: AiProvider[] = [];
  if (hasApiKeyForProvider('anthropic')) providers.push('anthropic');
  if (hasApiKeyForProvider('openai')) providers.push('openai');
  return providers;
}

// ============================================================================
// Model Persistence
// ============================================================================

export function getStoredModel(): string {
  return localStorage.getItem(STORAGE_KEYS.model) || getPreferredDefaultModel(['anthropic']);
}

export function setStoredModel(model: string): void {
  localStorage.setItem(STORAGE_KEYS.model, model);
}

// ============================================================================
// Provider Detection
// ============================================================================

export function getProviderFromModel(modelId: string): AiProvider {
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
