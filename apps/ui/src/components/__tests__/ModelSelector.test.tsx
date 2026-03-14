/** @jest-environment jsdom */

import { TransformStream } from 'node:stream/web';
import { act, render, screen, waitFor } from '@testing-library/react';
import { jest } from '@jest/globals';
import { ModelSelector } from '../ModelSelector';
import { clearApiKey, storeApiKey } from '../../stores/apiKeyStore';

if (!globalThis.TransformStream) {
  Object.defineProperty(globalThis, 'TransformStream', {
    configurable: true,
    value: TransformStream,
  });
}

jest.mock('../../services/aiService', () => ({
  SYSTEM_PROMPT: '',
  buildTools: () => ({}),
  createModel: jest.fn(),
}));

jest.mock('../../services/aiStream', () => ({
  startAiStream: jest.fn(),
}));

let useAiAgent = (() => {
  throw new Error('useAiAgent test dependency not loaded');
}) as typeof import('../../hooks/useAiAgent').useAiAgent;

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

function ModelSelectorHarness() {
  const { currentModel, availableProviders, setCurrentModel } = useAiAgent();

  return (
    <ModelSelector
      currentModel={currentModel}
      availableProviders={availableProviders}
      onChange={setCurrentModel}
    />
  );
}

describe('ModelSelector provider refresh', () => {
  beforeAll(async () => {
    ({ useAiAgent } = await import('../../hooks/useAiAgent'));
  });

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

  it('refreshes a mounted selector when an OpenAI key is added after mount', async () => {
    render(<ModelSelectorHarness />);

    expect(screen.getByText('No API keys')).toBeTruthy();

    act(() => {
      storeApiKey('openai', 'openai-test-key');
    });

    await screen.findByRole('combobox');
    expect(await screen.findByRole('option', { name: 'GPT-5.4' })).toBeTruthy();

    await waitFor(() => {
      expect(screen.queryByText('No API keys')).toBeNull();
    });
  });

  it('adds OpenAI models to an already-mounted Anthropic selector without manual refresh', async () => {
    act(() => {
      storeApiKey('anthropic', 'anthropic-test-key');
    });

    render(<ModelSelectorHarness />);

    expect(await screen.findByRole('option', { name: 'Claude Sonnet 4.5 (Latest)' })).toBeTruthy();

    act(() => {
      storeApiKey('openai', 'openai-test-key');
    });

    expect(await screen.findByRole('option', { name: 'GPT-5.4' })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Claude Sonnet 4.5 (Latest)' })).toBeTruthy();
  });

  it('falls back to GPT-5.4 when the selected Anthropic provider is removed', async () => {
    act(() => {
      storeApiKey('anthropic', 'anthropic-test-key');
      storeApiKey('openai', 'openai-test-key');
    });

    render(<ModelSelectorHarness />);

    const select = await screen.findByRole('combobox');
    expect(await screen.findByRole('option', { name: 'GPT-5.4' })).toBeTruthy();

    act(() => {
      clearApiKey('anthropic');
    });

    await waitFor(() => {
      expect((select as HTMLSelectElement).value).toBe('gpt-5.4');
    });
    expect(screen.queryByRole('option', { name: 'Claude Sonnet 4.5 (Latest)' })).toBeNull();
  });
});
