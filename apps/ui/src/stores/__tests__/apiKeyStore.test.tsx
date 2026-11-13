/** @jest-environment jsdom */

import { act } from 'react';
import { render, screen } from '@testing-library/react';
import {
  clearOpenAiCompatibleConfig,
  clearApiKey,
  getOpenAiCompatibleConfig,
  getApiKey,
  getProviderFromModel,
  getStoredModel,
  getStoredModelSelection,
  invalidateApiKeyStatus,
  setStoredModelSelection,
  setStoredModel,
  storeOpenAiCompatibleConfig,
  storeApiKey,
  useAvailableProviders,
  useHasApiKey,
} from '../apiKeyStore';

function StoreHarness() {
  const providers = useAvailableProviders();
  const hasApiKey = useHasApiKey();

  return (
    <div>
      <div data-testid="providers">{providers.join(',')}</div>
      <div data-testid="has-key">{String(hasApiKey)}</div>
    </div>
  );
}

describe('apiKeyStore', () => {
  beforeEach(() => {
    localStorage.clear();
    invalidateApiKeyStatus();
  });

  it('stores obfuscated keys and reads them back', () => {
    storeApiKey('anthropic', 'secret-key');

    const stored = localStorage.getItem('openscad_studio_anthropic_api_key');
    expect(stored).toMatch(/^obf1:/);
    expect(stored).not.toContain('secret-key');
    expect(getApiKey('anthropic')).toBe('secret-key');
  });

  it('migrates legacy plaintext values when reading them', () => {
    localStorage.setItem('openscad_studio_openai_api_key', 'plain-text');

    expect(getApiKey('openai')).toBe('plain-text');
    expect(localStorage.getItem('openscad_studio_openai_api_key')).toMatch(/^obf1:/);
  });

  it('persists the selected model and infers providers from known model prefixes', () => {
    expect(getStoredModel()).toBe('claude-sonnet-4-6');
    expect(getStoredModelSelection()).toEqual({
      provider: 'anthropic',
      modelId: 'claude-sonnet-4-6',
    });

    setStoredModel('gpt-5.4');
    expect(getStoredModel()).toBe('gpt-5.4');
    expect(getStoredModelSelection()).toEqual({ provider: 'openai', modelId: 'gpt-5.4' });
    expect(getProviderFromModel('claude-sonnet-4-6')).toBe('anthropic');
    expect(getProviderFromModel('gpt-5.4')).toBe('openai');
    expect(getProviderFromModel('chatgpt-4o-latest')).toBe('openai');
    expect(getProviderFromModel('unknown-model')).toBe('anthropic');

    setStoredModelSelection({ provider: 'openai-compatible', modelId: 'gemma4:12b' });
    expect(getStoredModel()).toBe('gemma4:12b');
    expect(getStoredModelSelection()).toEqual({
      provider: 'openai-compatible',
      modelId: 'gemma4:12b',
    });
  });

  it('migrates legacy bare hosted model ids to provider-aware selections', () => {
    localStorage.setItem('openscad_studio_ai_model', 'claude-sonnet-4-6');

    expect(getStoredModelSelection()).toEqual({
      provider: 'anthropic',
      modelId: 'claude-sonnet-4-6',
    });

    localStorage.setItem('openscad_studio_ai_model', 'gpt-4o');

    expect(getStoredModelSelection()).toEqual({
      provider: 'openai',
      modelId: 'gpt-4o',
    });

    localStorage.setItem('openscad_studio_ai_model', 'o3-mini');

    expect(getStoredModelSelection()).toEqual({
      provider: 'openai',
      modelId: 'o3-mini',
    });
  });

  it('prefers the new provider-aware selection over a legacy bare model id', () => {
    localStorage.setItem('openscad_studio_ai_model', 'gpt-4o');
    localStorage.setItem(
      'openscad_studio_ai_model_selection',
      JSON.stringify({ provider: 'anthropic', modelId: 'claude-opus-4' })
    );

    expect(getStoredModel()).toBe('claude-opus-4');
    expect(getStoredModelSelection()).toEqual({
      provider: 'anthropic',
      modelId: 'claude-opus-4',
    });
  });

  it('falls back to a legacy bare model id when the provider-aware selection is corrupt', () => {
    localStorage.setItem('openscad_studio_ai_model_selection', 'not-json');
    localStorage.setItem('openscad_studio_ai_model', 'gpt-4o');

    expect(getStoredModelSelection()).toEqual({
      provider: 'openai',
      modelId: 'gpt-4o',
    });
  });

  it('falls back to the first configured provider for unknown legacy model ids', () => {
    storeApiKey('openai', 'openai-key');
    localStorage.setItem('openscad_studio_ai_model', 'unknown-legacy-model');

    expect(getStoredModelSelection()).toEqual({
      provider: 'openai',
      modelId: 'gpt-5.4',
    });
  });

  it('uses configured OpenAI-compatible settings for unknown legacy model ids', () => {
    storeOpenAiCompatibleConfig({
      baseUrl: ' http://127.0.0.1:11434/v1/ ',
      modelId: 'gemma4:12b',
      apiKey: null,
    });
    localStorage.setItem('openscad_studio_ai_model', 'local-alias');

    expect(getOpenAiCompatibleConfig()).toEqual({
      baseUrl: 'http://127.0.0.1:11434/v1',
      modelId: 'gemma4:12b',
      apiKey: null,
    });
    expect(getStoredModelSelection()).toEqual({
      provider: 'openai-compatible',
      modelId: 'gemma4:12b',
    });
  });

  describe.each(['legacy', 'provider-aware'] as const)(
    '%s Sonnet retirement migration',
    (format) => {
      it.each([
        'claude-sonnet-4-5',
        'claude-sonnet-4-5-20250929',
        'claude-sonnet-4-0',
        'claude-sonnet-4-20250514',
        'claude-3-7-sonnet-latest',
        'claude-3-7-sonnet-20250219',
        'claude-3-5-sonnet-latest',
        'claude-3-5-sonnet-20241022',
        'claude-3-5-sonnet-20240620',
      ])('migrates %s and persists both storage formats', (modelId) => {
        localStorage.setItem('openscad_studio_ai_model', ` ${modelId} `);
        if (format === 'provider-aware') {
          localStorage.setItem(
            'openscad_studio_ai_model_selection',
            JSON.stringify({
              provider: 'anthropic',
              modelId: ` ${modelId} `,
            })
          );
        }
        const expected = { provider: 'anthropic', modelId: 'claude-sonnet-4-6' };
        expect(getStoredModelSelection()).toEqual(expected);
        expect(getStoredModelSelection()).toEqual(expected);
        expect(localStorage.getItem('openscad_studio_ai_model')).toBe(expected.modelId);
        expect(JSON.parse(localStorage.getItem('openscad_studio_ai_model_selection')!)).toEqual(
          expected
        );
      });
    }
  );

  it.each([
    { provider: 'openai-compatible' as const, modelId: 'claude-sonnet-4-5' },
    { provider: 'openai' as const, modelId: 'gpt-5.4' },
    { provider: 'anthropic' as const, modelId: 'claude-sonnet-4-6' },
    { provider: 'anthropic' as const, modelId: 'claude-sonnet-5-5' },
    { provider: 'anthropic' as const, modelId: 'claude-sonnet-4-5-custom' },
  ])('preserves unrelated selection $provider / $modelId', (selection) => {
    setStoredModelSelection(selection);
    expect(getStoredModelSelection()).toEqual(selection);
  });

  it('publishes provider availability through useSyncExternalStore hooks', () => {
    render(<StoreHarness />);

    expect(screen.getByTestId('providers').textContent).toBe('');
    expect(screen.getByTestId('has-key').textContent).toBe('false');

    act(() => {
      storeApiKey('anthropic', 'a-key');
      storeApiKey('openai', 'o-key');
    });

    expect(screen.getByTestId('providers').textContent).toBe('anthropic,openai');
    expect(screen.getByTestId('has-key').textContent).toBe('true');

    act(() => {
      clearApiKey('anthropic');
      invalidateApiKeyStatus();
    });

    expect(screen.getByTestId('providers').textContent).toBe('openai');
    expect(screen.getByTestId('has-key').textContent).toBe('true');

    act(() => {
      clearApiKey('openai');
    });

    expect(screen.getByTestId('providers').textContent).toBe('');
    expect(screen.getByTestId('has-key').textContent).toBe('false');
  });

  it('publishes OpenAI-compatible availability without requiring an API key', () => {
    render(<StoreHarness />);

    act(() => {
      storeOpenAiCompatibleConfig({
        baseUrl: 'http://localhost:1234/v1',
        modelId: '',
        apiKey: null,
      });
    });

    expect(screen.getByTestId('providers').textContent).toBe('openai-compatible');
    expect(screen.getByTestId('has-key').textContent).toBe('true');
    expect(getApiKey('openai-compatible')).toBeNull();

    act(() => {
      clearOpenAiCompatibleConfig();
    });

    expect(screen.getByTestId('providers').textContent).toBe('');
    expect(screen.getByTestId('has-key').textContent).toBe('false');
  });
});
