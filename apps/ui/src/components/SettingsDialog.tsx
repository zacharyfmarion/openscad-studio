import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { loadSettings, saveSettings, type Settings } from '../stores/settingsStore';
import { getAvailableThemes } from '../themes';
import { useTheme } from '../contexts/ThemeContext';
import { Button, Input, Select, Label, Toggle } from './ui';

interface SettingsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSettingsChange?: (settings: Settings) => void;
}

type SettingsSection = 'appearance' | 'editor' | 'ai';

export function SettingsDialog({ isOpen, onClose, onSettingsChange }: SettingsDialogProps) {
  const [activeSection, setActiveSection] = useState<SettingsSection>('appearance');
  const [settings, setSettings] = useState<Settings>(loadSettings());
  const { updateTheme } = useTheme();
  const availableThemes = getAvailableThemes();

  // AI Settings
  const [provider, setProvider] = useState<'anthropic' | 'openai'>('anthropic');
  const [model, setModel] = useState('claude-sonnet-4-5-20250929');
  const [apiKey, setApiKey] = useState('');
  const [hasKey, setHasKey] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [showKey, setShowKey] = useState(false);

  // Model options (Updated 2025-10)
  const anthropicModels = [
    { value: 'claude-sonnet-4-5-20250929', label: 'Claude Sonnet 4.5 (Latest - Best for coding)' },
    { value: 'claude-opus-4-1-20250805', label: 'Claude Opus 4.1 (Best for complex tasks)' },
    { value: 'claude-3-5-haiku-20241022', label: 'Claude 3.5 Haiku (Fastest)' },
    { value: 'claude-3-5-sonnet-20241022', label: 'Claude 3.5 Sonnet (October)' },
    { value: 'claude-3-5-sonnet-20240620', label: 'Claude 3.5 Sonnet (June)' },
    { value: 'claude-3-opus-20240229', label: 'Claude 3 Opus' },
  ];

  const openaiModels = [
    { value: 'gpt-4o', label: 'GPT-4o (Latest - Multimodal)' },
    { value: 'gpt-4o-mini', label: 'GPT-4o Mini (Fast & Affordable)' },
    { value: 'gpt-4-turbo', label: 'GPT-4 Turbo' },
    { value: 'gpt-4', label: 'GPT-4' },
    { value: 'gpt-3.5-turbo', label: 'GPT-3.5 Turbo' },
  ];

  // Load settings when dialog opens
  useEffect(() => {
    if (isOpen) {
      setSettings(loadSettings());
      loadAISettings();
    }
  }, [isOpen]);

  const loadAISettings = async () => {
    try {
      const currentProvider = await invoke<string>('get_ai_provider');
      setProvider(currentProvider as 'anthropic' | 'openai');

      const currentModel = await invoke<string>('get_ai_model');
      setModel(currentModel);

      const exists = await invoke<boolean>('has_api_key');
      setHasKey(exists);
      if (exists) {
        // Load masked key for display
        setApiKey('••••••••••••••••••••••••••••••••••••••••••••');
      } else {
        setApiKey('');
      }
    } catch (err) {
      console.error('Failed to load AI settings:', err);
    }
  };

  const handleAppearanceSettingChange = <K extends keyof Settings['appearance']>(
    key: K,
    value: Settings['appearance'][K]
  ) => {
    const updated = {
      ...settings,
      appearance: {
        ...settings.appearance,
        [key]: value,
      },
    };
    setSettings(updated);
    onSettingsChange?.(updated);

    // Update theme via context (context handles persistence and applying CSS)
    if (key === 'theme') {
      updateTheme(value as string);
    }
  };

  const handleEditorSettingChange = <K extends keyof Settings['editor']>(
    key: K,
    value: Settings['editor'][K]
  ) => {
    const updated = {
      ...settings,
      editor: {
        ...settings.editor,
        [key]: value,
      },
    };
    setSettings(updated);
    saveSettings(updated);
    onSettingsChange?.(updated);
  };

  const handleSave = async () => {
    if (!apiKey.trim() || apiKey.startsWith('•')) {
      setError('Please enter a valid API key');
      return;
    }

    setIsLoading(true);
    setError(null);
    setSuccessMessage(null);

    try {
      await invoke('store_api_key', { provider, key: apiKey });
      await invoke('set_ai_model', { model });
      setSuccessMessage('Settings saved successfully!');
      setHasKey(true);
      setApiKey('••••••••••••••••••••••••••••••••••••••••••••');
      setShowKey(false);
      setTimeout(() => {
        setSuccessMessage(null);
      }, 3000);
    } catch (err) {
      setError(`Failed to save settings: ${err}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClear = async () => {
    const confirmed = confirm('Are you sure you want to remove your API key?');
    if (!confirmed) return;

    setIsLoading(true);
    setError(null);
    setSuccessMessage(null);

    try {
      await invoke('clear_api_key');
      setSuccessMessage('API key cleared successfully');
      setHasKey(false);
      setApiKey('');
      setTimeout(() => {
        setSuccessMessage(null);
      }, 3000);
    } catch (err) {
      setError(`Failed to clear API key: ${err}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleChangeKey = () => {
    setApiKey('');
    setShowKey(true);
  };

  const handleProviderChange = (newProvider: 'anthropic' | 'openai') => {
    setProvider(newProvider);
    // Set default model for new provider
    const defaultModel = newProvider === 'anthropic'
      ? 'claude-sonnet-4-5-20250929'
      : 'gpt-4o';
    setModel(defaultModel);
    setApiKey('');
    setShowKey(false);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50" style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}>
      <div className="rounded-lg shadow-xl w-full max-w-3xl mx-4 flex h-[600px]" style={{ backgroundColor: 'var(--bg-secondary)' }}>
        {/* Left Sidebar */}
        <div className="w-48 rounded-l-lg" style={{ backgroundColor: 'var(--bg-primary)', borderRight: '1px solid var(--border-primary)' }}>
          <div className="px-4 py-4" style={{ borderBottom: '1px solid var(--border-primary)' }}>
            <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>Settings</h2>
          </div>
          <nav className="p-2">
            <button
              onClick={() => setActiveSection('appearance')}
              className="w-full text-left px-3 py-2 rounded text-sm transition-colors"
              style={{
                backgroundColor: activeSection === 'appearance' ? 'var(--bg-tertiary)' : 'transparent',
                color: activeSection === 'appearance' ? 'var(--text-inverse)' : 'var(--text-secondary)'
              }}
            >
              Appearance
            </button>
            <button
              onClick={() => setActiveSection('editor')}
              className="w-full text-left px-3 py-2 rounded text-sm transition-colors"
              style={{
                backgroundColor: activeSection === 'editor' ? 'var(--bg-tertiary)' : 'transparent',
                color: activeSection === 'editor' ? 'var(--text-inverse)' : 'var(--text-secondary)'
              }}
            >
              Editor
            </button>
            <button
              onClick={() => setActiveSection('ai')}
              className="w-full text-left px-3 py-2 rounded text-sm transition-colors"
              style={{
                backgroundColor: activeSection === 'ai' ? 'var(--bg-tertiary)' : 'transparent',
                color: activeSection === 'ai' ? 'var(--text-inverse)' : 'var(--text-secondary)'
              }}
            >
              AI Assistant
            </button>
          </nav>
        </div>

        {/* Right Content */}
        <div className="flex-1 flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid var(--border-primary)' }}>
            <h3 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
              {activeSection === 'appearance' ? 'Appearance Settings' :
               activeSection === 'editor' ? 'Editor Settings' : 'AI Assistant Settings'}
            </h3>
            <button
              onClick={onClose}
              className="transition-colors"
              style={{ color: 'var(--text-secondary)' }}
            >
              ✕
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto px-6 py-4">
            {activeSection === 'appearance' && (
              <div className="space-y-4">
                {/* Theme Selector */}
                <div>
                  <Label>Theme</Label>
                  <p className="text-xs mb-3" style={{ color: 'var(--text-tertiary)' }}>
                    Choose a color theme for the entire application
                  </p>
                  <Select
                    value={settings.appearance.theme}
                    onChange={(e) => handleAppearanceSettingChange('theme', e.target.value)}
                  >
                    {availableThemes.map((theme) => (
                      <option key={theme.id} value={theme.id}>
                        {theme.name}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>
            )}

            {activeSection === 'editor' && (
              <div className="space-y-4">
                {/* Format on Save */}
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="mb-0">Format on Save</Label>
                    <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
                      Automatically format OpenSCAD code when saving files
                    </p>
                  </div>
                  <Toggle
                    checked={settings.editor.formatOnSave}
                    onChange={(e) => handleEditorSettingChange('formatOnSave', e.target.checked)}
                  />
                </div>

                {/* Indent Size */}
                <div>
                  <Label>Indent Size</Label>
                  <Select
                    value={settings.editor.indentSize}
                    onChange={(e) => handleEditorSettingChange('indentSize', Number(e.target.value))}
                  >
                    <option value={2}>2 spaces</option>
                    <option value={4}>4 spaces</option>
                    <option value={8}>8 spaces</option>
                  </Select>
                </div>

                {/* Use Tabs */}
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="mb-0">Use Tabs</Label>
                    <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
                      Use tab characters instead of spaces for indentation
                    </p>
                  </div>
                  <Toggle
                    checked={settings.editor.useTabs}
                    onChange={(e) => handleEditorSettingChange('useTabs', e.target.checked)}
                  />
                </div>
              </div>
            )}

            {activeSection === 'ai' && (
              <div className="space-y-4">
                <div>
                  <Label>AI Provider</Label>
                  <Select
                    value={provider}
                    onChange={(e) => handleProviderChange(e.target.value as 'anthropic' | 'openai')}
                    disabled={isLoading}
                  >
                    <option value="anthropic">Anthropic (Claude)</option>
                    <option value="openai">OpenAI (GPT)</option>
                  </Select>
                </div>

                <div>
                  <Label>Model</Label>
                  <p className="text-xs mb-3" style={{ color: 'var(--text-tertiary)' }}>
                    Select which AI model to use for code generation
                  </p>
                  <Select
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    disabled={isLoading}
                  >
                    {(provider === 'anthropic' ? anthropicModels : openaiModels).map((m) => (
                      <option key={m.value} value={m.value}>
                        {m.label}
                      </option>
                    ))}
                  </Select>
                </div>

                <div>
                  <Label>
                    {provider === 'anthropic' ? 'Anthropic API Key' : 'OpenAI API Key'}
                  </Label>
                  <p className="text-xs mb-3" style={{ color: 'var(--text-tertiary)' }}>
                    Your API key is stored securely in encrypted local storage and never leaves your device.
                  </p>
                  <div className="relative">
                    <Input
                      type={showKey ? 'text' : 'password'}
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      placeholder="sk-ant-..."
                      className="pr-20 font-mono"
                      disabled={isLoading || (hasKey && apiKey.startsWith('•'))}
                    />
                    {apiKey && !apiKey.startsWith('•') && (
                      <button
                        onClick={() => setShowKey(!showKey)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-xs px-2 py-1 transition-colors"
                        style={{ color: 'var(--text-secondary)' }}
                      >
                        {showKey ? '🙈 Hide' : '👁️ Show'}
                      </button>
                    )}
                  </div>
                </div>

                {error && (
                  <div className="px-3 py-2 rounded text-sm" style={{
                    backgroundColor: 'rgba(220, 50, 47, 0.2)',
                    borderColor: 'var(--color-error)',
                    borderWidth: '1px',
                    borderStyle: 'solid',
                    color: 'var(--color-error)'
                  }}>
                    {error}
                  </div>
                )}

                {successMessage && (
                  <div className="px-3 py-2 rounded text-sm" style={{
                    backgroundColor: 'rgba(133, 153, 0, 0.2)',
                    borderColor: 'var(--color-success)',
                    borderWidth: '1px',
                    borderStyle: 'solid',
                    color: 'var(--color-success)'
                  }}>
                    {successMessage}
                  </div>
                )}

                <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                  <p className="mb-1">
                    Don't have an API key?{' '}
                    <a
                      href={provider === 'anthropic'
                        ? 'https://console.anthropic.com/settings/keys'
                        : 'https://platform.openai.com/api-keys'}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline"
                      style={{ color: 'var(--accent-primary)' }}
                    >
                      Get one from {provider === 'anthropic' ? 'Anthropic' : 'OpenAI'}
                    </a>
                  </p>
                  <p>
                    Your API key is required for the AI Assistant features to work.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Footer - only show for AI section */}
          {activeSection === 'ai' && (
            <div className="flex items-center justify-between px-6 py-4" style={{ backgroundColor: 'var(--bg-secondary)', borderTop: '1px solid var(--border-primary)' }}>
              <div>
                {hasKey && apiKey.startsWith('•') && (
                  <button
                    onClick={handleChangeKey}
                    disabled={isLoading}
                    className="text-sm transition-colors"
                    style={{
                      color: isLoading ? 'var(--text-tertiary)' : 'var(--accent-primary)'
                    }}
                  >
                    Change Key
                  </button>
                )}
                {hasKey && (
                  <button
                    onClick={handleClear}
                    disabled={isLoading}
                    className="text-sm transition-colors ml-4"
                    style={{
                      color: isLoading ? 'var(--text-tertiary)' : 'var(--color-error)'
                    }}
                  >
                    Remove Key
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button variant="secondary" onClick={onClose} disabled={isLoading}>
                  Close
                </Button>
                <Button
                  variant="primary"
                  onClick={handleSave}
                  disabled={isLoading || !apiKey.trim() || apiKey.startsWith('•')}
                >
                  {isLoading ? 'Saving...' : 'Save'}
                </Button>
              </div>
            </div>
          )}

          {/* Footer for Appearance and Editor sections */}
          {(activeSection === 'appearance' || activeSection === 'editor') && (
            <div className="flex items-center justify-end px-6 py-4" style={{ backgroundColor: 'var(--bg-secondary)', borderTop: '1px solid var(--border-primary)' }}>
              <Button variant="secondary" onClick={onClose}>
                Close
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
