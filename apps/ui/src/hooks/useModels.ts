import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  fetchModels,
  getCachedModels,
  ModelInfo,
  FetchModelsResponse,
} from '../api/tauri';

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

export function useModels(availableProviders: string[]): UseModelsReturn {
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fromCache, setFromCache] = useState(false);
  const [cacheAgeMinutes, setCacheAgeMinutes] = useState<number | null>(null);

  const loadModels = useCallback(async (forceRefresh = false) => {
    setIsLoading(true);
    setError(null);

    try {
      const response: FetchModelsResponse = await fetchModels(forceRefresh);
      setModels(response.models);
      setFromCache(response.from_cache);
      setCacheAgeMinutes(response.cache_age_minutes ?? null);
    } catch (err) {
      console.error('Failed to fetch models:', err);
      setError(String(err));

      // Try to load from cache as fallback
      try {
        const cachedResponse = await getCachedModels();
        if (cachedResponse.models.length > 0) {
          setModels(cachedResponse.models);
          setFromCache(true);
          setCacheAgeMinutes(cachedResponse.cache_age_minutes ?? null);
        }
      } catch (cacheErr) {
        console.error('Failed to load cached models:', cacheErr);
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Load models on mount
  useEffect(() => {
    loadModels();
  }, [loadModels]);

  const refreshModels = useCallback(async () => {
    await loadModels(true);
  }, [loadModels]);

  // Filter by available providers
  const filteredModels = useMemo(() => {
    return models.filter((m) => availableProviders.includes(m.provider));
  }, [models, availableProviders]);

  // Group by provider for UI
  const groupedByProvider = useMemo((): GroupedModels => {
    return {
      anthropic: filteredModels.filter((m) => m.provider === 'anthropic'),
      openai: filteredModels.filter((m) => m.provider === 'openai'),
    };
  }, [filteredModels]);

  return {
    models: filteredModels,
    groupedByProvider,
    isLoading,
    error,
    fromCache,
    cacheAgeMinutes,
    refreshModels,
  };
}
