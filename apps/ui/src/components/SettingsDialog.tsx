import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { loadSettings, saveSettings, type Settings } from '../stores/settingsStore';

interface SettingsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSettingsChange?: (settings: Settings) => void;
}

type SettingsSection = 'editor' | 'ai';

export function SettingsDialog({ isOpen, onClose, onSettingsChange }: SettingsDialogProps) {
  const [activeSection, setActiveSection] = useState<SettingsSection>('editor');
  const [settings, setSettings] = useState<Settings>(loadSettings());

  // AI Settings
  const [provider, setProvider] = useState<'anthropic' | 'openai'>('anthropic');
  const [apiKey, setApiKey] = useState('');
  const [hasKey, setHasKey] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [showKey, setShowKey] = useState(false);

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
      setSuccessMessage('API key saved successfully!');
      setHasKey(true);
      setApiKey('••••••••••••••••••••••••••••••••••••••••••••');
      setShowKey(false);
      setTimeout(() => {
        setSuccessMessage(null);
      }, 3000);
    } catch (err) {
      setError(`Failed to save API key: ${err}`);
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

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-gray-800 rounded-lg shadow-xl w-full max-w-3xl mx-4 flex h-[600px]">
        {/* Left Sidebar */}
        <div className="w-48 bg-gray-750 border-r border-gray-700 rounded-l-lg">
          <div className="px-4 py-4 border-b border-gray-700">
            <h2 className="text-lg font-semibold text-gray-100">Settings</h2>
          </div>
          <nav className="p-2">
            <button
              onClick={() => setActiveSection('editor')}
              className={`w-full text-left px-3 py-2 rounded text-sm transition-colors ${
                activeSection === 'editor'
                  ? 'bg-gray-700 text-white'
                  : 'text-gray-400 hover:text-gray-200 hover:bg-gray-700/50'
              }`}
            >
              Editor
            </button>
            <button
              onClick={() => setActiveSection('ai')}
              className={`w-full text-left px-3 py-2 rounded text-sm transition-colors ${
                activeSection === 'ai'
                  ? 'bg-gray-700 text-white'
                  : 'text-gray-400 hover:text-gray-200 hover:bg-gray-700/50'
              }`}
            >
              AI Copilot
            </button>
          </nav>
        </div>

        {/* Right Content */}
        <div className="flex-1 flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700">
            <h3 className="text-lg font-semibold text-gray-100">
              {activeSection === 'editor' ? 'Editor Settings' : 'AI Copilot Settings'}
            </h3>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-200 transition-colors"
            >
              ✕
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto px-6 py-4">
            {activeSection === 'editor' && (
              <div className="space-y-4">
                {/* Format on Save */}
                <div className="flex items-center justify-between">
                  <div>
                    <label className="block text-sm font-medium text-gray-300">
                      Format on Save
                    </label>
                    <p className="text-xs text-gray-500 mt-1">
                      Automatically format OpenSCAD code when saving files
                    </p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settings.editor.formatOnSave}
                      onChange={(e) => handleEditorSettingChange('formatOnSave', e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-500 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                  </label>
                </div>

                {/* Indent Size */}
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Indent Size
                  </label>
                  <select
                    value={settings.editor.indentSize}
                    onChange={(e) => handleEditorSettingChange('indentSize', Number(e.target.value))}
                    className="w-full bg-gray-700 text-gray-100 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  >
                    <option value={2}>2 spaces</option>
                    <option value={4}>4 spaces</option>
                    <option value={8}>8 spaces</option>
                  </select>
                </div>

                {/* Use Tabs */}
                <div className="flex items-center justify-between">
                  <div>
                    <label className="block text-sm font-medium text-gray-300">
                      Use Tabs
                    </label>
                    <p className="text-xs text-gray-500 mt-1">
                      Use tab characters instead of spaces for indentation
                    </p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settings.editor.useTabs}
                      onChange={(e) => handleEditorSettingChange('useTabs', e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-500 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                  </label>
                </div>
              </div>
            )}

            {activeSection === 'ai' && (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    AI Provider
                  </label>
                  <select
                    value={provider}
                    onChange={(e) => {
                      setProvider(e.target.value as 'anthropic' | 'openai');
                      setApiKey('');
                      setShowKey(false);
                    }}
                    disabled={isLoading}
                    className="w-full bg-gray-700 text-gray-100 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  >
                    <option value="anthropic">Anthropic (Claude)</option>
                    <option value="openai">OpenAI (GPT)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    {provider === 'anthropic' ? 'Anthropic API Key' : 'OpenAI API Key'}
                  </label>
                  <p className="text-xs text-gray-500 mb-3">
                    Your API key is stored securely in encrypted local storage and never leaves your device.
                  </p>
                  <div className="relative">
                    <input
                      type={showKey ? 'text' : 'password'}
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      placeholder="sk-ant-..."
                      className="w-full bg-gray-700 text-gray-100 rounded px-3 py-2 pr-20 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm font-mono"
                      disabled={isLoading || (hasKey && apiKey.startsWith('•'))}
                    />
                    {apiKey && !apiKey.startsWith('•') && (
                      <button
                        onClick={() => setShowKey(!showKey)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-200 text-xs px-2 py-1"
                      >
                        {showKey ? '🙈 Hide' : '👁️ Show'}
                      </button>
                    )}
                  </div>
                </div>

                {error && (
                  <div className="bg-red-900/30 border border-red-700 text-red-300 px-3 py-2 rounded text-sm">
                    {error}
                  </div>
                )}

                {successMessage && (
                  <div className="bg-green-900/30 border border-green-700 text-green-300 px-3 py-2 rounded text-sm">
                    {successMessage}
                  </div>
                )}

                <div className="text-xs text-gray-500">
                  <p className="mb-1">
                    Don't have an API key?{' '}
                    <a
                      href={provider === 'anthropic'
                        ? 'https://console.anthropic.com/settings/keys'
                        : 'https://platform.openai.com/api-keys'}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-400 hover:text-blue-300 underline"
                    >
                      Get one from {provider === 'anthropic' ? 'Anthropic' : 'OpenAI'}
                    </a>
                  </p>
                  <p>
                    Your API key is required for the AI Copilot features to work.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Footer - only show for AI section */}
          {activeSection === 'ai' && (
            <div className="flex items-center justify-between px-6 py-4 bg-gray-750 border-t border-gray-700">
              <div>
                {hasKey && apiKey.startsWith('•') && (
                  <button
                    onClick={handleChangeKey}
                    disabled={isLoading}
                    className="text-sm text-blue-400 hover:text-blue-300 disabled:text-gray-600 transition-colors"
                  >
                    Change Key
                  </button>
                )}
                {hasKey && (
                  <button
                    onClick={handleClear}
                    disabled={isLoading}
                    className="text-sm text-red-400 hover:text-red-300 disabled:text-gray-600 transition-colors ml-4"
                  >
                    Remove Key
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={onClose}
                  disabled={isLoading}
                  className="px-4 py-2 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:text-gray-600 text-gray-200 rounded text-sm font-medium transition-colors"
                >
                  Close
                </button>
                <button
                  onClick={handleSave}
                  disabled={isLoading || !apiKey.trim() || apiKey.startsWith('•')}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded text-sm font-medium transition-colors"
                >
                  {isLoading ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>
          )}

          {/* Footer for Editor section */}
          {activeSection === 'editor' && (
            <div className="flex items-center justify-end px-6 py-4 bg-gray-750 border-t border-gray-700">
              <button
                onClick={onClose}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded text-sm font-medium transition-colors"
              >
                Close
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
