import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { getApiKey, type AiProvider } from '../stores/apiKeyStore';
import { getVisionSupportForModelId } from '../utils/aiMessages';
import type { VisionSupport } from '../types/aiChat';

export interface ModelInfo {
  id: string;
  display_name: string;
  provider: AiProvider;
  visionSupport: VisionSupport;
}

export interface GroupedModels {
  anthropic: ModelInfo[];
  openai: ModelInfo[];
}

export interface UseModelsReturn {
  models: ModelInfo[];
  groupedByProvider: GroupedModels;
  isLoading: boolean;
  error: string | null;
  fromCache: boolean;
  cacheAgeMinutes: number | null;
  refreshModels: () => Promise<void>;
}

const CACHE_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours
const CACHE_KEY = 'openscad_studio_models_cache';

interface CachedModels {
  models: ModelInfo[];
  fetchedAt: number;
}

const KNOWN_DISPLAY_NAMES: Record<string, string> = {
  'claude-sonnet-4-5': 'Claude Sonnet 4.5 (Latest)',
  'claude-opus-4': 'Claude Opus 4 (Latest)',
  'claude-haiku-3-5': 'Claude Haiku 3.5 (Latest)',
  'claude-sonnet-4-5-20250929': 'Claude Sonnet 4.5 (Sep 2025)',
  'claude-opus-4-1-20250805': 'Claude Opus 4.1 (Aug 2025)',
  'claude-3-5-sonnet-20241022': 'Claude 3.5 Sonnet (Oct 2024)',
  'claude-3-5-haiku-20241022': 'Claude 3.5 Haiku (Oct 2024)',
  'gpt-4o': 'GPT-4o',
  'gpt-4o-mini': 'GPT-4o Mini',
  o1: 'o1',
  'o1-mini': 'o1 Mini',
  'o3-mini': 'o3 Mini',
  'gpt-4-turbo': 'GPT-4 Turbo',
};

const DEFAULT_MODELS: ModelInfo[] = [
  {
    id: 'claude-sonnet-4-5',
    display_name: 'Claude Sonnet 4.5 (Latest)',
    provider: 'anthropic',
    visionSupport: 'yes',
  },
  {
    id: 'claude-opus-4',
    display_name: 'Claude Opus 4 (Latest)',
    provider: 'anthropic',
    visionSupport: 'yes',
  },
  {
    id: 'claude-haiku-3-5',
    display_name: 'Claude Haiku 3.5 (Latest)',
    provider: 'anthropic',
    visionSupport: 'yes',
  },
  { id: 'o1', display_name: 'o1 (Latest)', provider: 'openai', visionSupport: 'yes' },
  { id: 'o3-mini', display_name: 'o3 Mini (Latest)', provider: 'openai', visionSupport: 'yes' },
  { id: 'gpt-4o', display_name: 'GPT-4o', provider: 'openai', visionSupport: 'yes' },
];

function isAlias(modelId: string): boolean {
  const parts = modelId.split('-');
  const last = parts[parts.length - 1];
  return !(last.length === 8 && /^\d{8}$/.test(last));
}

function isRelevantOpenAiModel(id: string): boolean {
  if (id.includes('search') || id.includes('chat')) return false;
  const isOSeries = /^o\d/.test(id);
  return isOSeries || id.startsWith('gpt-5') || id.startsWith('gpt-4o');
}

interface AnthropicModel {
  id: string;
  display_name: string;
  created_at?: string;
}

interface AnthropicModelsResponse {
  data: AnthropicModel[];
  has_more: boolean;
  last_id?: string;
}

interface OpenAiModel {
  id: string;
  created?: number;
  owned_by?: string;
}

interface OpenAiModelsResponse {
  data: OpenAiModel[];
}

async function fetchAnthropicModels(apiKey: string): Promise<ModelInfo[]> {
  const allModels: ModelInfo[] = [];
  let afterId: string | undefined;

  let hasMore = true;
  while (hasMore) {
    let url = 'https://api.anthropic.com/v1/models?limit=100';
    if (afterId) url += `&after_id=${afterId}`;

    const resp = await fetch(url, {
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
    });

    if (!resp.ok) {
      throw new Error(`Anthropic API error (${resp.status}): ${await resp.text()}`);
    }

    const data: AnthropicModelsResponse = await resp.json();

    for (const m of data.data) {
      allModels.push({
        id: m.id,
        display_name: KNOWN_DISPLAY_NAMES[m.id] || m.display_name,
        provider: 'anthropic',
        visionSupport: getVisionSupportForModelId(m.id),
      });
    }

    hasMore = data.has_more;
    afterId = data.last_id;
  }

  return allModels;
}

async function fetchOpenAiModels(apiKey: string): Promise<ModelInfo[]> {
  const resp = await fetch('https://api.openai.com/v1/models', {
    headers: { Authorization: `Bearer ${apiKey}` },
  });

  if (!resp.ok) {
    throw new Error(`OpenAI API error (${resp.status}): ${await resp.text()}`);
  }

  const data: OpenAiModelsResponse = await resp.json();

  return data.data
    .filter((m) => isRelevantOpenAiModel(m.id))
    .map((m) => ({
      id: m.id,
      display_name: KNOWN_DISPLAY_NAMES[m.id] || m.id,
      provider: 'openai' as const,
      visionSupport: getVisionSupportForModelId(m.id),
    }));
}

function sortModels(models: ModelInfo[]): ModelInfo[] {
  return [...models].sort((a, b) => {
    if (a.provider !== b.provider) return a.provider.localeCompare(b.provider);
    const aIsAlias = isAlias(a.id);
    const bIsAlias = isAlias(b.id);
    if (aIsAlias !== bIsAlias) return aIsAlias ? -1 : 1;
    return a.display_name.localeCompare(b.display_name);
  });
}

function loadCache(providers: string[]): { models: ModelInfo[]; ageMinutes: number } | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const cached: CachedModels = JSON.parse(raw);
    const age = Date.now() - cached.fetchedAt;
    if (age > CACHE_TTL_MS) return null;
    const filtered = cached.models
      .filter((m) => providers.includes(m.provider))
      .map((model) => ({
        ...model,
        visionSupport: model.visionSupport || getVisionSupportForModelId(model.id),
      }));
    if (filtered.length === 0) return null;
    return { models: filtered, ageMinutes: Math.floor(age / 60000) };
  } catch {
    return null;
  }
}

function saveCache(models: ModelInfo[]): void {
  try {
    const cached: CachedModels = { models, fetchedAt: Date.now() };
    localStorage.setItem(CACHE_KEY, JSON.stringify(cached));
  } catch {
    // localStorage full or unavailable
  }
}

export function useModels(availableProviders: string[]): UseModelsReturn {
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fromCache, setFromCache] = useState(false);
  const [cacheAgeMinutes, setCacheAgeMinutes] = useState<number | null>(null);
  const providersRef = useRef(availableProviders);
  providersRef.current = availableProviders;
  const providersKey = [...availableProviders].sort().join(',');
  const initialLoadDone = useRef(false);

  const doFetch = useCallback(
    async (forceRefresh: boolean) => {
      const providers = providersRef.current;
      if (providers.length === 0) {
        setModels([]);
        return;
      }

      if (!forceRefresh) {
        const cached = loadCache(providers);
        if (cached) {
          setModels(sortModels(cached.models));
          setFromCache(true);
          setCacheAgeMinutes(cached.ageMinutes);
          return;
        }
      }

      setIsLoading(true);
      setError(null);

      try {
        const fetches: Promise<ModelInfo[]>[] = [];

        if (providers.includes('anthropic')) {
          const key = getApiKey('anthropic');
          if (key) fetches.push(fetchAnthropicModels(key).catch(() => []));
        }
        if (providers.includes('openai')) {
          const key = getApiKey('openai');
          if (key) fetches.push(fetchOpenAiModels(key).catch(() => []));
        }

        const results = await Promise.all(fetches);
        const allModels = results.flat();

        if (allModels.length > 0) {
          const sorted = sortModels(allModels);
          setModels(sorted);
          setFromCache(false);
          setCacheAgeMinutes(null);
          saveCache(sorted);
        } else {
          const defaults = DEFAULT_MODELS.filter((m) => providers.includes(m.provider));
          setModels(defaults);
        }
      } catch (e) {
        setError(String(e));
        const defaults = DEFAULT_MODELS.filter((m) => providersRef.current.includes(m.provider));
        setModels(defaults);
      } finally {
        setIsLoading(false);
      }
    },
    // providersKey is a stable string serialization — avoids infinite re-renders from array refs
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [providersKey]
  );

  useEffect(() => {
    if (providersRef.current.length === 0) {
      setModels([]);
      initialLoadDone.current = false;
      return;
    }
    if (!initialLoadDone.current) {
      initialLoadDone.current = true;
      doFetch(false);
    }
  }, [providersKey, doFetch]);

  const refreshModels = useCallback(() => doFetch(true), [doFetch]);

  const groupedByProvider = useMemo(
    (): GroupedModels => ({
      anthropic: models.filter((m) => m.provider === 'anthropic'),
      openai: models.filter((m) => m.provider === 'openai'),
    }),
    [models]
  );

  return {
    models,
    groupedByProvider,
    isLoading,
    error,
    fromCache,
    cacheAgeMinutes,
    refreshModels,
  };
}
