import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { getApiKey, type AiProvider } from '../stores/apiKeyStore';
import { getVisionSupportForModelId } from '../utils/aiMessages';
import {
  compareModelsByFreshness,
  DEFAULT_MODEL_CATALOG,
  KNOWN_DISPLAY_NAMES,
  normalizeProviders,
} from '../utils/aiModels';
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
  providers?: AiProvider[];
}

const DEFAULT_MODELS: ModelInfo[] = DEFAULT_MODEL_CATALOG.map((model) => ({
  ...model,
  visionSupport: getVisionSupportForModelId(model.id),
}));

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
  return [...models].sort(compareModelsByFreshness);
}

function getCachedProviders(cached: CachedModels): AiProvider[] {
  if (Array.isArray(cached.providers) && cached.providers.length > 0) {
    return normalizeProviders(cached.providers);
  }
  return normalizeProviders(cached.models.map((model) => model.provider));
}

function hasCacheCoverage(cached: CachedModels, providers: readonly string[]): boolean {
  const requestedProviders = normalizeProviders(providers);
  const cachedProviders = getCachedProviders(cached);
  return requestedProviders.every((provider) => cachedProviders.includes(provider));
}

function loadCache(providers: string[]): { models: ModelInfo[]; ageMinutes: number } | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const cached: CachedModels = JSON.parse(raw);
    const age = Date.now() - cached.fetchedAt;
    if (age > CACHE_TTL_MS) return null;
    if (!hasCacheCoverage(cached, providers)) return null;
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

function saveCache(models: ModelInfo[], providers: readonly string[]): void {
  try {
    const cached: CachedModels = {
      models,
      fetchedAt: Date.now(),
      providers: normalizeProviders(providers),
    };
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
  const requestIdRef = useRef(0);

  const doFetch = useCallback(
    async (forceRefresh: boolean) => {
      const requestId = ++requestIdRef.current;
      const providers = providersRef.current;
      if (providers.length === 0) {
        if (requestId !== requestIdRef.current) return;
        setModels([]);
        setError(null);
        setFromCache(false);
        setCacheAgeMinutes(null);
        setIsLoading(false);
        return;
      }

      if (!forceRefresh) {
        const cached = loadCache(providers);
        if (cached) {
          if (requestId !== requestIdRef.current) return;
          setModels(sortModels(cached.models));
          setError(null);
          setFromCache(true);
          setCacheAgeMinutes(cached.ageMinutes);
          setIsLoading(false);
          return;
        }
      }

      setIsLoading(true);
      setError(null);
      setFromCache(false);
      setCacheAgeMinutes(null);

      try {
        const fetches: Promise<{ models: ModelInfo[]; error: string | null }>[] = [];

        if (providers.includes('anthropic')) {
          const key = getApiKey('anthropic');
          if (key) {
            fetches.push(
              fetchAnthropicModels(key)
                .then((models) => ({ models, error: null }))
                .catch((error) => ({
                  models: [],
                  error: error instanceof Error ? error.message : String(error),
                }))
            );
          }
        }
        if (providers.includes('openai')) {
          const key = getApiKey('openai');
          if (key) {
            fetches.push(
              fetchOpenAiModels(key)
                .then((models) => ({ models, error: null }))
                .catch((error) => ({
                  models: [],
                  error: error instanceof Error ? error.message : String(error),
                }))
            );
          }
        }

        const results = await Promise.all(fetches);
        const allModels = results.flatMap((result) => result.models);
        const errors = results
          .map((result) => result.error)
          .filter((value): value is string => Boolean(value));
        if (requestId !== requestIdRef.current) return;

        if (allModels.length > 0) {
          const sorted = sortModels(allModels);
          setModels(sorted);
          setError(errors.length > 0 ? errors.join('\n') : null);
          setFromCache(false);
          setCacheAgeMinutes(null);
          saveCache(sorted, providers);
        } else {
          const defaults = DEFAULT_MODELS.filter((m) => providers.includes(m.provider));
          setModels(defaults);
          setError(errors.length > 0 ? errors.join('\n') : null);
          setFromCache(false);
          setCacheAgeMinutes(null);
        }
      } catch (e) {
        if (requestId !== requestIdRef.current) return;
        setError(String(e));
        const defaults = DEFAULT_MODELS.filter((m) => providersRef.current.includes(m.provider));
        setModels(defaults);
        setFromCache(false);
        setCacheAgeMinutes(null);
      } finally {
        if (requestId === requestIdRef.current) {
          setIsLoading(false);
        }
      }
    },
    // providersKey is a stable string serialization — avoids infinite re-renders from array refs
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [providersKey]
  );

  useEffect(() => {
    void doFetch(false);
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
