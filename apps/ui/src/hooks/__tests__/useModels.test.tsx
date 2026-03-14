/** @jest-environment jsdom */

import { render, screen, waitFor } from '@testing-library/react';
import { jest } from '@jest/globals';
import { useModels } from '../useModels';
import type { AiProvider } from '../../stores/apiKeyStore';
import { clearApiKey, storeApiKey } from '../../stores/apiKeyStore';

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
        data: [{ id: 'claude-sonnet-4-5', display_name: 'Claude Sonnet 4.5' }],
        has_more: false,
      });
    }

    if (url.includes('api.openai.com')) {
      return createJsonResponse({
        data: [{ id: 'gpt-4o' }, { id: 'gpt-5' }, { id: 'gpt-5.4' }],
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
    </div>
  );
}

describe('useModels', () => {
  beforeEach(() => {
    localStorage.clear();
    clearApiKey('anthropic');
    clearApiKey('openai');

    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      value: createFetchMock(),
    });
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('ignores an anthropic-only cache entry when OpenAI is newly enabled', async () => {
    storeApiKey('anthropic', 'anthropic-test-key');
    storeApiKey('openai', 'openai-test-key');

    localStorage.setItem(
      'openscad_studio_models_cache',
      JSON.stringify({
        models: [
          {
            id: 'claude-sonnet-4-5',
            display_name: 'Claude Sonnet 4.5 (Latest)',
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
      expect(screen.getByTestId('anthropic').textContent).toContain('claude-sonnet-4-5');
      expect(screen.getByTestId('openai').textContent).toContain('gpt-5.4');
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
      expect(screen.getByTestId('anthropic').textContent).toContain('claude-sonnet-4-5');
      expect(screen.getByTestId('openai').textContent).toContain('gpt-5.4');
    });

    rerender(<UseModelsHarness availableProviders={['anthropic']} />);

    await waitFor(() => {
      expect(screen.getByTestId('anthropic').textContent).toContain('claude-sonnet-4-5');
      expect(screen.getByTestId('openai').textContent).toBe('');
    });
  });

  it('sorts OpenAI models from newest to oldest aliases', async () => {
    storeApiKey('openai', 'openai-test-key');

    render(<UseModelsHarness availableProviders={['openai']} />);

    await waitFor(() => {
      expect(screen.getByTestId('openai').textContent).toBe('gpt-5.4,gpt-5,gpt-4o');
    });
  });
});
