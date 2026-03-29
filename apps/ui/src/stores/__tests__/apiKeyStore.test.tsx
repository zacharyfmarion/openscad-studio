/** @jest-environment jsdom */

import { act } from 'react';
import { render, screen } from '@testing-library/react';
import {
  clearApiKey,
  getApiKey,
  getProviderFromModel,
  getStoredModel,
  invalidateApiKeyStatus,
  setStoredModel,
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
    expect(getStoredModel()).toBe('claude-sonnet-4-5');

    setStoredModel('gpt-5.4');
    expect(getStoredModel()).toBe('gpt-5.4');
    expect(getProviderFromModel('claude-sonnet-4-5')).toBe('anthropic');
    expect(getProviderFromModel('gpt-5.4')).toBe('openai');
    expect(getProviderFromModel('chatgpt-4o-latest')).toBe('openai');
    expect(getProviderFromModel('unknown-model')).toBe('anthropic');
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
});
