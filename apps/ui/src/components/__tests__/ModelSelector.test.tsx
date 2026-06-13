/** @jest-environment jsdom */

import { TransformStream } from 'node:stream/web';
import { act, screen, waitFor } from '@testing-library/react';
import { jest } from '@jest/globals';
import {
  clearApiKey,
  clearOpenAiCompatibleConfig,
  setStoredModelSelection,
  storeApiKey,
  storeOpenAiCompatibleConfig,
} from '../../stores/apiKeyStore';
import { renderWithProviders } from './test-utils';

if (!globalThis.TransformStream) {
  Object.defineProperty(globalThis, 'TransformStream', {
    configurable: true,
    value: TransformStream,
  });
}

jest.unstable_mockModule('@/services/aiService', () => ({
  SYSTEM_PROMPT: '',
  buildTools: () => ({}),
  createModel: jest.fn(),
}));

jest.unstable_mockModule('@/services/aiStream', () => ({
  startAiStream: jest.fn(),
}));

let useAiAgent = (() => {
  throw new Error('useAiAgent test dependency not loaded');
}) as typeof import('../../hooks/useAiAgent').useAiAgent;
let ModelSelector: typeof import('../ModelSelector').ModelSelector;

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

    if (url === 'http://127.0.0.1:11434/v1/models') {
      return createJsonResponse({
        data: [{ id: 'gemma4:12b' }],
      });
    }

    if (url === 'http://localhost:1234/v1/models') {
      return createJsonResponse({
        data: [{ id: 'lm-studio-model' }],
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

function ModelSelectorHarness() {
  const { currentProvider, currentModel, availableProviders, setCurrentModel } = useAiAgent();

  // Wrap in <form> so Radix Select renders its hidden native <select> for option assertions
  return (
    <form>
      <ModelSelector
        currentModel={currentModel}
        currentProvider={currentProvider}
        availableProviders={availableProviders}
        onChange={(model, provider) => setCurrentModel(model, 'unknown', provider)}
      />
    </form>
  );
}

describe('ModelSelector provider refresh', () => {
  beforeAll(async () => {
    ({ ModelSelector } = await import('../ModelSelector'));
    ({ useAiAgent } = await import('../../hooks/useAiAgent'));
  });

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

  // Helper: get option labels from Radix Select's hidden native <select>
  function getNativeSelectOptionLabels(): string[] {
    const options = document.querySelectorAll('select option');
    return Array.from(options).map((o) => o.textContent ?? '');
  }

  it('refreshes a mounted selector when an OpenAI key is added after mount', async () => {
    renderWithProviders(<ModelSelectorHarness />);

    expect(screen.getByText('No AI provider configured')).toBeTruthy();

    act(() => {
      storeApiKey('openai', 'openai-test-key');
    });

    await screen.findByRole('combobox');

    await waitFor(() => {
      expect(getNativeSelectOptionLabels()).toContain('GPT-5.4');
    });
    await waitFor(() => {
      expect(screen.queryByText('No AI provider configured')).toBeNull();
    });
  });

  it('adds OpenAI models to an already-mounted Anthropic selector without manual refresh', async () => {
    act(() => {
      storeApiKey('anthropic', 'anthropic-test-key');
    });

    renderWithProviders(<ModelSelectorHarness />);

    await screen.findByRole('combobox');
    await waitFor(() => {
      expect(getNativeSelectOptionLabels()).toContain('Claude Sonnet 4.5 (Latest)');
    });

    act(() => {
      storeApiKey('openai', 'openai-test-key');
    });

    await waitFor(() => {
      const labels = getNativeSelectOptionLabels();
      expect(labels).toContain('GPT-5.4');
      expect(labels).toContain('Claude Sonnet 4.5 (Latest)');
    });
  });

  it('falls back to GPT-5.4 when the selected Anthropic provider is removed', async () => {
    act(() => {
      storeApiKey('anthropic', 'anthropic-test-key');
      storeApiKey('openai', 'openai-test-key');
    });

    renderWithProviders(<ModelSelectorHarness />);

    await screen.findByRole('combobox');
    await waitFor(() => {
      expect(getNativeSelectOptionLabels()).toContain('GPT-5.4');
    });

    act(() => {
      clearApiKey('anthropic');
    });

    await waitFor(() => {
      const labels = getNativeSelectOptionLabels();
      expect(labels).not.toContain('Claude Sonnet 4.5 (Latest)');
      expect(labels).toContain('GPT-5.4');
    });

    const nativeSelect = document.querySelector('select') as HTMLSelectElement | null;
    await waitFor(() => {
      expect(nativeSelect?.value).toContain('gpt-5.4');
      expect(nativeSelect?.value).toContain('openai');
    });
  });

  it('shows OpenAI-compatible models when a local provider is configured without an API key', async () => {
    act(() => {
      storeOpenAiCompatibleConfig({
        baseUrl: 'http://127.0.0.1:11434/v1',
        modelId: '',
        apiKey: null,
      });
    });

    renderWithProviders(<ModelSelectorHarness />);

    await screen.findByRole('combobox');
    await waitFor(() => {
      expect(getNativeSelectOptionLabels()).toContain('gemma4:12b');
    });
  });

  it('selects the first discovered local model when the saved local selection is stale', async () => {
    act(() => {
      storeOpenAiCompatibleConfig({
        baseUrl: 'http://localhost:1234/v1',
        modelId: '',
        apiKey: null,
      });
      setStoredModelSelection({ provider: 'openai-compatible', modelId: 'gemma4:12b' });
    });

    renderWithProviders(<ModelSelectorHarness />);

    await screen.findByRole('combobox');
    await waitFor(() => {
      expect(getNativeSelectOptionLabels()).toContain('lm-studio-model');
    });

    const nativeSelect = document.querySelector('select') as HTMLSelectElement | null;
    await waitFor(() => {
      expect(nativeSelect?.value).toContain('lm-studio-model');
      expect(nativeSelect?.value).toContain('openai-compatible');
    });
  });
});
