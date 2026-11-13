/** @jest-environment jsdom */

import { render, screen, waitFor } from '@testing-library/react';
import { jest } from '@jest/globals';
import { useModels } from '../useModels';
import type { AiProvider } from '../../stores/apiKeyStore';
import {
  clearApiKey,
  clearOpenAiCompatibleConfig,
  storeApiKey,
  storeOpenAiCompatibleConfig,
} from '../../stores/apiKeyStore';

function createJsonResponse(body: unknown) {
  return {
    ok: true,
    status: 200,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as Response;
}

function createFetchMock() {
  return jest.fn(async (input: string | URL | Request) => {
    const url = typeof input === 'string' ? input : input.toString();

    if (url.includes('api.anthropic.com')) {
      return createJsonResponse({
        data: [{ id: 'claude-sonnet-5-5', display_name: 'Claude Sonnet 5.5' }],
        has_more: false,
      });
    }

    if (url.includes('api.openai.com')) {
      return createJsonResponse({
        data: [{ id: 'gpt-4o' }, { id: 'gpt-5' }, { id: 'gpt-6.1-sol' }],
      });
    }

    if (url === 'http://127.0.0.1:11434/v1/models') {
      return createJsonResponse({
        data: [{ id: 'gemma4:12b' }, { id: 'qwen3-coder:latest' }],
      });
    }

    return {
      ok: false,
      status: 404,
      json: async () => ({}),
      text: async () => 'Not found',
    } as Response;
  });
}

function UseModelsHarness({ availableProviders }: { availableProviders: AiProvider[] }) {
  const { groupedByProvider, isLoading } = useModels(availableProviders);

  return (
    <div>
      <div data-testid="loading">{String(isLoading)}</div>
      <div data-testid="anthropic">
        {groupedByProvider.anthropic.map((model) => model.id).join(',')}
      </div>
      <div data-testid="openai">{groupedByProvider.openai.map((model) => model.id).join(',')}</div>
      <div data-testid="openai-compatible">
        {groupedByProvider.openaiCompatible.map((model) => model.id).join(',')}
      </div>
    </div>
  );
}

describe('useModels', () => {
  beforeEach(() => {
    localStorage.clear();
    clearApiKey('anthropic');
    clearApiKey('openai');
    clearOpenAiCompatibleConfig();

    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      value: createFetchMock(),
    });
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('refreshes cached deprecated Sonnet catalogs', async () => {
    storeApiKey('anthropic', 'test-key');
    localStorage.setItem(
      'openscad_studio_models_cache',
      JSON.stringify({
        fetchedAt: Date.now(),
        providers: ['anthropic'],
        models: [
          { id: 'claude-sonnet-4-5', display_name: 'Old Sonnet', provider: 'anthropic' },
          { id: 'claude-opus-4-6', display_name: 'Opus', provider: 'anthropic' },
        ],
      })
    );
    render(<UseModelsHarness availableProviders={['anthropic']} />);
    await waitFor(() =>
      expect(screen.getByTestId('anthropic').textContent).toBe('claude-sonnet-5-5')
    );
    expect(globalThis.fetch).toHaveBeenCalled();
  });

  it('does not offer deprecated Sonnet IDs returned by discovery', async () => {
    storeApiKey('anthropic', 'test-key');
    (globalThis.fetch as jest.Mock).mockResolvedValue(
      createJsonResponse({
        data: [
          { id: 'claude-sonnet-4-5-20250929', display_name: 'Old Sonnet' },
          { id: 'claude-opus-4', display_name: 'Retired Opus' },
          { id: 'claude-3-5-haiku-20241022', display_name: 'Retired Haiku' },
          { id: 'claude-sonnet-5-5', display_name: 'Sonnet 5.5' },
        ],
        has_more: false,
      }) as never
    );
    render(<UseModelsHarness availableProviders={['anthropic']} />);
    await waitFor(() =>
      expect(screen.getByTestId('anthropic').textContent).toBe('claude-sonnet-5-5')
    );
  });

  it('uses the supported Sonnet fallback when discovery fails', async () => {
    storeApiKey('anthropic', 'test-key');
    (globalThis.fetch as jest.Mock).mockRejectedValue(new Error('offline') as never);
    render(<UseModelsHarness availableProviders={['anthropic']} />);
    await waitFor(() => {
      expect(screen.getByTestId('anthropic').textContent).toContain('claude-sonnet-5-5');
      expect(screen.getByTestId('anthropic').textContent).not.toContain('claude-sonnet-4-5');
    });
  });

  it('applies the same retirement registry to OpenAI discovery and cached models', async () => {
    storeApiKey('openai', 'test-key');
    localStorage.setItem(
      'openscad_studio_models_cache',
      JSON.stringify({
        fetchedAt: Date.now(),
        providers: ['openai'],
        models: [{ id: 'o3-mini', display_name: 'Old reasoning model', provider: 'openai' }],
      })
    );
    (globalThis.fetch as jest.Mock).mockResolvedValue(
      createJsonResponse({
        data: [{ id: 'o3-mini' }, { id: 'o3-mini-2025-01-31' }, { id: 'gpt-6.1-sol' }],
      }) as never
    );
    render(<UseModelsHarness availableProviders={['openai']} />);
    await waitFor(() => expect(screen.getByTestId('openai').textContent).toBe('gpt-6.1-sol'));
    expect(globalThis.fetch).toHaveBeenCalled();
  });

  it('preserves local endpoint IDs that match hosted retired models', async () => {
    storeOpenAiCompatibleConfig({
      baseUrl: 'http://127.0.0.1:11434/v1',
      modelId: 'o3-mini',
      apiKey: null,
    });
    (globalThis.fetch as jest.Mock).mockResolvedValue(
      createJsonResponse({
        data: [{ id: 'o3-mini' }, { id: 'claude-sonnet-4-5' }],
      }) as never
    );
    render(<UseModelsHarness availableProviders={['openai-compatible']} />);
    await waitFor(() => {
      expect(screen.getByTestId('openai-compatible').textContent).toContain('o3-mini');
      expect(screen.getByTestId('openai-compatible').textContent).toContain('claude-sonnet-4-5');
    });
  });

  it('ignores an anthropic-only cache entry when OpenAI is newly enabled', async () => {
    storeApiKey('anthropic', 'anthropic-test-key');
    storeApiKey('openai', 'openai-test-key');

    localStorage.setItem(
      'openscad_studio_models_cache',
      JSON.stringify({
        models: [
          {
            id: 'claude-sonnet-5-5',
            display_name: 'Claude Sonnet 5.5 (Latest)',
            provider: 'anthropic',
            visionSupport: 'yes',
          },
        ],
        providers: ['anthropic'],
        fetchedAt: Date.now(),
      })
    );

    const fetchMock = globalThis.fetch as jest.Mock;
    render(<UseModelsHarness availableProviders={['anthropic', 'openai']} />);

    await waitFor(() => {
      expect(screen.getByTestId('anthropic').textContent).toContain('claude-sonnet-5-5');
      expect(screen.getByTestId('openai').textContent).toContain('gpt-6.1-sol');
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.openai.com/v1/models',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer openai-test-key',
        }),
      })
    );
  });

  it('updates visible models when the available provider list shrinks', async () => {
    storeApiKey('anthropic', 'anthropic-test-key');
    storeApiKey('openai', 'openai-test-key');

    const { rerender } = render(<UseModelsHarness availableProviders={['anthropic', 'openai']} />);

    await waitFor(() => {
      expect(screen.getByTestId('anthropic').textContent).toContain('claude-sonnet-5-5');
      expect(screen.getByTestId('openai').textContent).toContain('gpt-6.1-sol');
    });

    rerender(<UseModelsHarness availableProviders={['anthropic']} />);

    await waitFor(() => {
      expect(screen.getByTestId('anthropic').textContent).toContain('claude-sonnet-5-5');
      expect(screen.getByTestId('openai').textContent).toBe('');
    });
  });

  it('sorts OpenAI models from newest to oldest aliases', async () => {
    storeApiKey('openai', 'openai-test-key');

    render(<UseModelsHarness availableProviders={['openai']} />);

    await waitFor(() => {
      expect(screen.getByTestId('openai').textContent).toBe('gpt-6.1-sol,gpt-5,gpt-4o');
    });
  });

  it('fetches OpenAI-compatible models without filtering local model ids', async () => {
    storeOpenAiCompatibleConfig({
      baseUrl: 'http://127.0.0.1:11434/v1',
      modelId: '',
      apiKey: null,
    });

    render(<UseModelsHarness availableProviders={['openai-compatible']} />);

    await waitFor(() => {
      expect(screen.getByTestId('openai-compatible').textContent).toBe(
        'gemma4:12b,qwen3-coder:latest'
      );
    });

    expect(globalThis.fetch as jest.Mock).toHaveBeenCalledWith('http://127.0.0.1:11434/v1/models', {
      headers: {},
    });
  });

  it('falls back to the configured OpenAI-compatible model when model refresh fails', async () => {
    storeOpenAiCompatibleConfig({
      baseUrl: 'http://localhost:1234/v1',
      modelId: 'lm-studio-model',
      apiKey: null,
    });

    render(<UseModelsHarness availableProviders={['openai-compatible']} />);

    await waitFor(() => {
      expect(screen.getByTestId('openai-compatible').textContent).toBe('lm-studio-model');
    });
  });
});
