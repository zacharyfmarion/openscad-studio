import { useState, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react';
import { Button, Input, Text } from '../ui';
import { useAnalytics } from '../../analytics/runtime';
import {
  DEFAULT_OPENAI_COMPATIBLE_BASE_URL,
  clearStoredModelSelectionForProvider,
  clearOpenAiCompatibleConfig,
  storeApiKey as storeApiKeyToStorage,
  clearApiKey as clearApiKeyFromStorage,
  getApiKey,
  getOpenAiCompatibleConfig,
  hasApiKeyForProvider,
  hasOpenAiCompatibleConfig,
  normalizeOpenAiCompatibleBaseUrl,
  storeOpenAiCompatibleConfig,
  getAvailableProviders as getAvailableProvidersFromStore,
  type AiProvider,
} from '../../stores/apiKeyStore';
import { useSettings } from '../../stores/settingsStore';
import { getPlatform } from '../../platform';
import { notifyError, notifySuccess } from '../../utils/notifications';
import {
  SettingsCard,
  SettingsCardHeader,
  SettingsCardSection,
  SettingsSupportBlock,
} from './SettingsPrimitives';
import { ApiProviderCard } from './ApiProviderCard';
import { ExternalAgentsCard } from './ExternalAgentsCard';

const MASKED_KEY = '••••••••••••••••••••••••••••••••••••••••••••';

export interface AiSettingsHandle {
  save: () => void;
}

interface AiSettingsProps {
  /** Triggers state reload each time the dialog opens */
  isOpen: boolean;
  /** Called whenever the save button's enabled state changes */
  onCanSaveChange: (canSave: boolean) => void;
}

export const AiSettings = forwardRef<AiSettingsHandle, AiSettingsProps>(
  ({ isOpen, onCanSaveChange }, ref) => {
    const [provider, setProvider] = useState<AiProvider>('anthropic');
    const [apiKey, setApiKey] = useState('');
    const [hasAnthropicKey, setHasAnthropicKey] = useState(false);
    const [hasOpenAIKey, setHasOpenAIKey] = useState(false);
    const [hasOpenAiCompatibleProvider, setHasOpenAiCompatibleProvider] = useState(false);
    const [customBaseUrl, setCustomBaseUrl] = useState(
      () => getOpenAiCompatibleConfig().baseUrl || DEFAULT_OPENAI_COMPATIBLE_BASE_URL
    );
    const [isTestingCompatible, setIsTestingCompatible] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [showKey, setShowKey] = useState(false);
    const analytics = useAnalytics();
    const [settings] = useSettings();
    const isLoading = isTestingCompatible;
    const isWeb = !getPlatform().capabilities.hasFileSystem;

    const loadKeys = useCallback(() => {
      const availableProviders = getAvailableProvidersFromStore();
      setHasAnthropicKey(availableProviders.includes('anthropic'));
      setHasOpenAIKey(availableProviders.includes('openai'));
      setHasOpenAiCompatibleProvider(hasOpenAiCompatibleConfig());

      const customConfig = getOpenAiCompatibleConfig();
      setCustomBaseUrl(customConfig.baseUrl || DEFAULT_OPENAI_COMPATIBLE_BASE_URL);

      if (hasApiKeyForProvider(provider)) {
        setApiKey(MASKED_KEY);
      } else {
        setApiKey('');
      }
    }, [provider]);

    useEffect(() => {
      if (isOpen) {
        loadKeys();
      }
    }, [isOpen, loadKeys]);

    useEffect(() => {
      if (provider === 'openai-compatible') {
        onCanSaveChange(!isLoading && !!normalizeOpenAiCompatibleBaseUrl(customBaseUrl));
        return;
      }
      onCanSaveChange(!isLoading && !!apiKey.trim() && !apiKey.startsWith('•'));
    }, [apiKey, customBaseUrl, isLoading, onCanSaveChange, provider]);

    const handleSave = useCallback(() => {
      if (provider === 'openai-compatible') {
        const baseUrl = normalizeOpenAiCompatibleBaseUrl(customBaseUrl);
        if (!baseUrl) {
          setError('Enter a base URL for the OpenAI-compatible provider');
          return;
        }

        setError(null);

        try {
          const previousConfig = getOpenAiCompatibleConfig();
          const existingKey = getApiKey('openai-compatible');
          const keyToStore = apiKey.startsWith('•') ? existingKey : apiKey.trim() || null;
          storeOpenAiCompatibleConfig({
            baseUrl,
            modelId: '',
            apiKey: keyToStore,
          });
          if (previousConfig.baseUrl !== baseUrl) {
            clearStoredModelSelectionForProvider('openai-compatible');
          }
          analytics.track('api key saved', { provider });
          notifySuccess('OpenAI-compatible provider saved', {
            toastId: 'save-api-key-openai-compatible',
          });
          setHasOpenAiCompatibleProvider(true);
          setCustomBaseUrl(baseUrl);
          setApiKey(keyToStore ? MASKED_KEY : '');
          setShowKey(false);
        } catch (err) {
          notifyError({
            operation: 'save-openai-compatible-provider',
            error: err,
            fallbackMessage: 'Failed to save OpenAI-compatible provider',
            toastId: 'save-api-key-error-openai-compatible',
            logLabel: '[AiSettings] Failed to save OpenAI-compatible provider',
          });
        }
        return;
      }

      if (!apiKey.trim() || apiKey.startsWith('•')) {
        setError('Please enter a valid API key');
        return;
      }

      setError(null);

      try {
        storeApiKeyToStorage(provider, apiKey);
        analytics.track('api key saved', { provider });
        notifySuccess(`${provider === 'anthropic' ? 'Anthropic' : 'OpenAI'} API key saved`, {
          toastId: `save-api-key-${provider}`,
        });

        if (provider === 'anthropic') {
          setHasAnthropicKey(true);
        } else {
          setHasOpenAIKey(true);
        }

        setApiKey(MASKED_KEY);
        setShowKey(false);
      } catch (err) {
        notifyError({
          operation: 'save-api-key',
          error: err,
          fallbackMessage: 'Failed to save API key',
          toastId: `save-api-key-error-${provider}`,
          logLabel: '[AiSettings] Failed to save API key',
        });
      }
    }, [apiKey, customBaseUrl, provider, analytics]);

    useImperativeHandle(ref, () => ({ save: handleSave }), [handleSave]);

    const handleClear = async (targetProvider: AiProvider) => {
      const providerLabel =
        targetProvider === 'anthropic'
          ? 'Anthropic'
          : targetProvider === 'openai'
            ? 'OpenAI'
            : 'OpenAI-compatible';
      const confirmed = await getPlatform().confirm(
        `Are you sure you want to remove your ${providerLabel} AI settings?`,
        { title: 'Remove AI Settings', kind: 'warning', okLabel: 'Remove', cancelLabel: 'Cancel' }
      );
      if (!confirmed) return;

      setError(null);

      try {
        if (targetProvider === 'openai-compatible') {
          clearOpenAiCompatibleConfig();
        } else {
          clearApiKeyFromStorage(targetProvider);
        }
        analytics.track('api key cleared', { provider: targetProvider });
        notifySuccess('AI settings cleared', { toastId: `clear-api-key-${targetProvider}` });

        if (targetProvider === 'anthropic') {
          setHasAnthropicKey(false);
        } else if (targetProvider === 'openai') {
          setHasOpenAIKey(false);
        } else {
          setHasOpenAiCompatibleProvider(false);
          setCustomBaseUrl(DEFAULT_OPENAI_COMPATIBLE_BASE_URL);
        }

        if (provider === targetProvider) {
          setApiKey('');
        }
      } catch (err) {
        notifyError({
          operation: 'clear-api-key',
          error: err,
          fallbackMessage: 'Failed to clear API key',
          toastId: `clear-api-key-error-${targetProvider}`,
          logLabel: '[AiSettings] Failed to clear API key',
        });
      }
    };

    const handleTestOpenAiCompatible = async () => {
      const baseUrl = normalizeOpenAiCompatibleBaseUrl(customBaseUrl);
      if (!baseUrl) {
        setError('Enter a base URL before testing the provider');
        return;
      }

      setProvider('openai-compatible');
      setError(null);
      setIsTestingCompatible(true);

      try {
        const key = apiKey.startsWith('•') ? getApiKey('openai-compatible') : apiKey.trim();
        const headers: Record<string, string> = {};
        if (key) {
          headers.Authorization = `Bearer ${key}`;
        }
        const response = await fetch(`${baseUrl}/models`, { headers });
        if (!response.ok) {
          throw new Error(
            `OpenAI-compatible API error (${response.status}): ${await response.text()}`
          );
        }
        const body = (await response.json()) as { data?: Array<{ id?: string }> };
        const models = Array.isArray(body.data) ? body.data : [];
        notifySuccess(
          models.length > 0
            ? `Connected to OpenAI-compatible provider (${models.length} model${models.length === 1 ? '' : 's'})`
            : 'Connected to OpenAI-compatible provider',
          { toastId: 'test-openai-compatible-provider' }
        );
      } catch (err) {
        notifyError({
          operation: 'test-openai-compatible-provider',
          error: err,
          fallbackMessage:
            'Could not reach the OpenAI-compatible provider. Check that the local server is running and allows browser requests.',
          toastId: 'test-openai-compatible-provider-error',
          logLabel: '[AiSettings] Failed to test OpenAI-compatible provider',
        });
      } finally {
        setIsTestingCompatible(false);
      }
    };

    return (
      <div className="flex flex-col ph-no-capture" style={{ gap: 'var(--space-section-gap)' }}>
        <Text variant="body" color="secondary">
          Connect hosted API keys or a local OpenAI-compatible server, then choose the model from
          the chat composer.
        </Text>

        <ApiProviderCard
          title="Anthropic API Key"
          description="Required for Claude models."
          placeholder="sk-ant-..."
          keyLink={{
            label: 'Get one from Anthropic',
            href: 'https://console.anthropic.com/settings/keys',
          }}
          isActive={provider === 'anthropic'}
          hasKey={hasAnthropicKey}
          apiKey={apiKey}
          showKey={showKey}
          isLoading={isLoading}
          onFocus={() => {
            if (provider !== 'anthropic') {
              setProvider('anthropic');
              setApiKey('');
              setShowKey(false);
            } else {
              setProvider('anthropic');
            }
          }}
          onChange={(value) => {
            setProvider('anthropic');
            setApiKey(value);
          }}
          onToggleShow={() => setShowKey((prev) => !prev)}
          onClear={() => {
            setProvider('anthropic');
            handleClear('anthropic');
          }}
        />

        <ApiProviderCard
          title="OpenAI API Key"
          description="Required for OpenAI models."
          placeholder="sk-..."
          keyLink={{ label: 'Get one from OpenAI', href: 'https://platform.openai.com/api-keys' }}
          isActive={provider === 'openai'}
          hasKey={hasOpenAIKey}
          apiKey={apiKey}
          showKey={showKey}
          isLoading={isLoading}
          onFocus={() => {
            if (provider !== 'openai') {
              setProvider('openai');
              setApiKey('');
              setShowKey(false);
            } else {
              setProvider('openai');
            }
          }}
          onChange={(value) => {
            setProvider('openai');
            setApiKey(value);
          }}
          onToggleShow={() => setShowKey((prev) => !prev)}
          onClear={() => {
            setProvider('openai');
            handleClear('openai');
          }}
        />

        <SettingsCard className="ph-no-capture">
          <SettingsCardHeader
            title="OpenAI-compatible Provider"
            description="For local servers such as Ollama, llama.cpp, and LM Studio."
            action={
              <span
                className="text-xs px-2 py-0.5 rounded-full font-medium"
                style={{
                  backgroundColor: hasOpenAiCompatibleProvider
                    ? 'rgba(133, 153, 0, 0.15)'
                    : 'rgba(128, 128, 128, 0.1)',
                  color: hasOpenAiCompatibleProvider
                    ? 'var(--color-success)'
                    : 'var(--text-tertiary)',
                }}
              >
                {hasOpenAiCompatibleProvider ? 'Configured' : 'Not configured'}
              </span>
            }
          />
          <SettingsCardSection className="flex flex-col" style={{ gap: 'var(--space-field-gap)' }}>
            <label className="flex flex-col" style={{ gap: 'var(--space-helper-gap)' }}>
              <Text variant="caption" color="secondary">
                Base URL
              </Text>
              <Input
                value={customBaseUrl}
                onFocus={() => {
                  setProvider('openai-compatible');
                  setApiKey(hasApiKeyForProvider('openai-compatible') ? MASKED_KEY : '');
                  setShowKey(false);
                }}
                onChange={(event) => {
                  setProvider('openai-compatible');
                  setCustomBaseUrl(event.target.value);
                }}
                placeholder="http://127.0.0.1:11434/v1"
                className="font-mono text-sm ph-no-capture"
                disabled={isLoading}
              />
            </label>

            <label className="flex flex-col" style={{ gap: 'var(--space-helper-gap)' }}>
              <Text variant="caption" color="secondary">
                API key (optional)
              </Text>
              <div className="relative">
                <Input
                  type={showKey && provider === 'openai-compatible' ? 'text' : 'password'}
                  value={provider === 'openai-compatible' ? apiKey : ''}
                  onFocus={() => {
                    setProvider('openai-compatible');
                    setApiKey(hasApiKeyForProvider('openai-compatible') ? MASKED_KEY : '');
                  }}
                  onChange={(event) => {
                    setProvider('openai-compatible');
                    setApiKey(event.target.value);
                  }}
                  placeholder="Leave blank for Ollama or LM Studio"
                  className="pr-20 font-mono text-sm ph-no-capture"
                  disabled={isLoading}
                />
                {provider === 'openai-compatible' && apiKey && !apiKey.startsWith('•') ? (
                  // eslint-disable-next-line no-restricted-syntax -- absolute-positioned inline toggle overlay on a password input; matches API key cards above
                  <button
                    type="button"
                    onClick={() => setShowKey((prev) => !prev)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-xs px-2 py-1 rounded-lg transition-colors"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    {showKey ? 'Hide' : 'Show'}
                  </button>
                ) : null}
              </div>
            </label>

            <Text variant="caption" color="tertiary">
              Examples: Ollama `http://127.0.0.1:11434/v1`, llama.cpp `http://127.0.0.1:8080/v1`, LM
              Studio `http://localhost:1234/v1`.
            </Text>

            {isWeb ? (
              <Text variant="caption" color="tertiary">
                On the web, your local LLM server must allow browser CORS requests.
              </Text>
            ) : null}

            <div
              className="flex items-center justify-between"
              style={{ gap: 'var(--space-control-gap)' }}
            >
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => {
                  void handleTestOpenAiCompatible();
                }}
                disabled={isLoading}
              >
                {isTestingCompatible ? 'Testing...' : 'Test Connection'}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => {
                  setProvider('openai-compatible');
                  void handleClear('openai-compatible');
                }}
                disabled={isLoading || !hasOpenAiCompatibleProvider}
              >
                Clear
              </Button>
            </div>
          </SettingsCardSection>
        </SettingsCard>

        {error && (
          <SettingsSupportBlock
            className="flex items-center text-sm"
            style={{
              gap: 'var(--space-control-gap)',
              backgroundColor: 'rgba(220, 50, 47, 0.1)',
              border: '1px solid rgba(220, 50, 47, 0.3)',
              color: 'var(--color-error)',
            }}
          >
            {error}
          </SettingsSupportBlock>
        )}

        {getPlatform().capabilities.hasFileSystem ? (
          <ExternalAgentsCard settings={settings} isOpen={isOpen} />
        ) : null}
      </div>
    );
  }
);

AiSettings.displayName = 'AiSettings';
