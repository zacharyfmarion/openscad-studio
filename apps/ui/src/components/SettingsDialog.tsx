import { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { loadSettings, saveSettings, getDefaultVimConfig, type Settings } from '../stores/settingsStore';
import { getAvailableThemes, getTheme } from '../themes';
import { useTheme } from '../contexts/ThemeContext';
import { Button, Input, Select, Label, Toggle } from './ui';
import { Editor as MonacoEditor } from '@monaco-editor/react';
import type * as Monaco from 'monaco-editor';
import { registerVimConfigLanguage } from '../languages/vimConfigLanguage';

interface SettingsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSettingsChange?: (settings: Settings) => void;
}

type SettingsSection = 'appearance' | 'editor' | 'ai';
type EditorSubTab = 'general' | 'vim';

export function SettingsDialog({ isOpen, onClose, onSettingsChange }: SettingsDialogProps) {
  const [activeSection, setActiveSection] = useState<SettingsSection>('appearance');
  const [editorSubTab, setEditorSubTab] = useState<EditorSubTab>('general');
  const [settings, setSettings] = useState<Settings>(loadSettings());
  const { updateTheme } = useTheme();
  const availableThemes = getAvailableThemes();
  const vimEditorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);

  // AI Settings
  const [provider, setProvider] = useState<'anthropic' | 'openai'>('anthropic');
  const [apiKey, setApiKey] = useState('');
  const [hasAnthropicKey, setHasAnthropicKey] = useState(false);
  const [hasOpenAIKey, setHasOpenAIKey] = useState(false);
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
      // Check which providers have keys
      const availableProviders = await invoke<string[]>('get_available_providers');
      setHasAnthropicKey(availableProviders.includes('anthropic'));
      setHasOpenAIKey(availableProviders.includes('openai'));

      const currentProvider = await invoke<string>('get_ai_provider');
      setProvider(currentProvider as 'anthropic' | 'openai');

      // Load the masked key for the current provider if it exists
      const hasCurrentKey = availableProviders.includes(currentProvider);
      if (hasCurrentKey) {
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
      setSuccessMessage(`${provider === 'anthropic' ? 'Anthropic' : 'OpenAI'} API key saved successfully!`);

      // Update the appropriate key status
      if (provider === 'anthropic') {
        setHasAnthropicKey(true);
      } else {
        setHasOpenAIKey(true);
      }

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
    const confirmed = confirm(`Are you sure you want to remove your ${provider === 'anthropic' ? 'Anthropic' : 'OpenAI'} API key?`);
    if (!confirmed) return;

    setIsLoading(true);
    setError(null);
    setSuccessMessage(null);

    try {
      await invoke('clear_api_key');
      setSuccessMessage('API key cleared successfully');

      // Update the appropriate key status
      if (provider === 'anthropic') {
        setHasAnthropicKey(false);
      } else {
        setHasOpenAIKey(false);
      }

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
                {/* Subtabs */}
                <div className="flex gap-2 pb-2" style={{ borderBottom: '1px solid var(--border-primary)' }}>
                  <button
                    onClick={() => setEditorSubTab('general')}
                    className="px-3 py-1.5 text-sm rounded transition-colors"
                    style={{
                      backgroundColor: editorSubTab === 'general' ? 'var(--bg-tertiary)' : 'transparent',
                      color: editorSubTab === 'general' ? 'var(--text-primary)' : 'var(--text-secondary)',
                      fontWeight: editorSubTab === 'general' ? '500' : 'normal',
                    }}
                  >
                    General
                  </button>
                  <button
                    onClick={() => setEditorSubTab('vim')}
                    className="px-3 py-1.5 text-sm rounded transition-colors"
                    style={{
                      backgroundColor: editorSubTab === 'vim' ? 'var(--bg-tertiary)' : 'transparent',
                      color: editorSubTab === 'vim' ? 'var(--text-primary)' : 'var(--text-secondary)',
                      fontWeight: editorSubTab === 'vim' ? '500' : 'normal',
                    }}
                  >
                    Vim
                  </button>
                </div>

                {/* General Settings */}
                {editorSubTab === 'general' && (
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

                {/* Vim Settings */}
                {editorSubTab === 'vim' && (
                  <div className="space-y-4">
                    {/* Vim Mode Toggle */}
                    <div className="flex items-center justify-between">
                      <div>
                        <Label className="mb-0">Enable Vim Mode</Label>
                        <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
                          Enable vim keybindings and modal editing in the editor
                        </p>
                      </div>
                      <Toggle
                        checked={settings.editor.vimMode}
                        onChange={(e) => handleEditorSettingChange('vimMode', e.target.checked)}
                      />
                    </div>

                    {/* Vim Configuration Editor */}
                    {settings.editor.vimMode && (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label className="mb-0">Vim Configuration</Label>
                          <button
                            onClick={() => handleEditorSettingChange('vimConfig', getDefaultVimConfig())}
                            className="text-xs px-2 py-1 rounded transition-colors"
                            style={{
                              color: 'var(--accent-primary)',
                              border: '1px solid var(--border-primary)',
                            }}
                          >
                            Reset to Defaults
                          </button>
                        </div>
                        <p className="text-xs mb-2" style={{ color: 'var(--text-tertiary)' }}>
                          Customize vim keybindings using vim-style commands. Lines starting with # are comments.
                        </p>
                        <div style={{ height: '300px', border: '1px solid var(--border-primary)', borderRadius: '4px', overflow: 'hidden' }}>
                          <MonacoEditor
                            height="100%"
                            defaultLanguage="vimconfig"
                            theme={getTheme(settings.appearance.theme).monaco}
                            value={settings.editor.vimConfig}
                            onChange={(val) => handleEditorSettingChange('vimConfig', val ?? '')}
                            onMount={(editor, monaco) => {
                              vimEditorRef.current = editor;

                              // Register vim config language
                              registerVimConfigLanguage(monaco);

                              // Register all custom themes
                              const themeIds = [
                                'solarized-dark',
                                'solarized-light',
                                'monokai',
                                'dracula',
                                'one-dark-pro',
                                'github-dark',
                                'github-light',
                                'nord',
                                'tokyo-night',
                                'gruvbox-dark',
                                'gruvbox-light',
                              ];

                              themeIds.forEach((id) => {
                                const theme = getTheme(id);
                                if (theme.monacoTheme) {
                                  monaco.editor.defineTheme(id, theme.monacoTheme);
                                }
                              });

                              // Apply current theme
                              monaco.editor.setTheme(getTheme(settings.appearance.theme).monaco);
                            }}
                            options={{
                              minimap: { enabled: false },
                              fontSize: 13,
                              lineNumbers: 'on',
                              scrollBeyondLastLine: false,
                              automaticLayout: true,
                              wordWrap: 'on',
                              tabSize: 2,
                              renderLineHighlight: 'line',
                            }}
                          />
                        </div>
                        <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                          Supported: <code style={{ color: 'var(--text-primary)' }}>map</code>, <code style={{ color: 'var(--text-primary)' }}>imap</code>, <code style={{ color: 'var(--text-primary)' }}>nmap</code>, <code style={{ color: 'var(--text-primary)' }}>vmap</code>
                          {' • '}
                          Example: <code style={{ color: 'var(--text-primary)' }}>map kj &lt;Esc&gt; insert</code>
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {activeSection === 'ai' && (
              <div className="space-y-6">
                <div>
                  <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
                    Add your API keys to enable AI assistant features. Model selection is available in the chat interface.
                  </p>
                </div>

                {/* Anthropic Section */}
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <Label className="mb-0">Anthropic API Key</Label>
                    <span className="text-xs px-2 py-0.5 rounded font-medium" style={{
                      backgroundColor: hasAnthropicKey ? 'rgba(133, 153, 0, 0.2)' : 'rgba(128, 128, 128, 0.2)',
                      color: hasAnthropicKey ? 'var(--color-success)' : 'var(--text-tertiary)',
                      borderWidth: '1px',
                      borderStyle: 'solid',
                      borderColor: hasAnthropicKey ? 'var(--color-success)' : 'var(--border-secondary)'
                    }}>
                      {hasAnthropicKey ? '✓ Configured' : 'Not Configured'}
                    </span>
                  </div>
                  <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                    Required for Claude models. Your key is stored securely and never leaves your device.
                  </p>
                  <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <Input
                        type={showKey && provider === 'anthropic' ? 'text' : 'password'}
                        value={provider === 'anthropic' ? apiKey : ''}
                        onChange={(e) => {
                          setProvider('anthropic');
                          setApiKey(e.target.value);
                        }}
                        onFocus={() => {
                          setProvider('anthropic');
                          if (provider !== 'anthropic') {
                            setApiKey('');
                            setShowKey(false);
                          }
                        }}
                        placeholder="sk-ant-..."
                        className="pr-20 font-mono text-sm"
                        disabled={isLoading}
                      />
                      {provider === 'anthropic' && apiKey && !apiKey.startsWith('•') && (
                        <button
                          onClick={() => setShowKey(!showKey)}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-xs px-2 py-1 transition-colors"
                          style={{ color: 'var(--text-secondary)' }}
                        >
                          {showKey ? '🙈 Hide' : '👁️ Show'}
                        </button>
                      )}
                    </div>
                    <button
                      onClick={() => {
                        setProvider('anthropic');
                        if (hasAnthropicKey) {
                          handleClear();
                        }
                      }}
                      disabled={isLoading || !hasAnthropicKey}
                      className="px-3 py-2 rounded transition-colors"
                      style={{
                        backgroundColor: 'transparent',
                        border: '1px solid var(--border-primary)',
                        color: hasAnthropicKey && !isLoading ? 'var(--color-error)' : 'var(--text-tertiary)',
                        opacity: hasAnthropicKey && !isLoading ? 1 : 0.5,
                        cursor: hasAnthropicKey && !isLoading ? 'pointer' : 'not-allowed'
                      }}
                      title={hasAnthropicKey ? 'Remove API key' : 'No API key to remove'}
                    >
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M2 4h12M5.333 4V2.667a.667.667 0 01.667-.667h4a.667.667 0 01.667.667V4m2 0v9.333a.667.667 0 01-.667.667H4a.667.667 0 01-.667-.667V4h9.334z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </button>
                  </div>
                  <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                    Don't have a key?{' '}
                    <a
                      href="https://console.anthropic.com/settings/keys"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline"
                      style={{ color: 'var(--accent-primary)' }}
                    >
                      Get one from Anthropic
                    </a>
                  </p>
                </div>

                {/* OpenAI Section */}
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <Label className="mb-0">OpenAI API Key</Label>
                    <span className="text-xs px-2 py-0.5 rounded font-medium" style={{
                      backgroundColor: hasOpenAIKey ? 'rgba(133, 153, 0, 0.2)' : 'rgba(128, 128, 128, 0.2)',
                      color: hasOpenAIKey ? 'var(--color-success)' : 'var(--text-tertiary)',
                      borderWidth: '1px',
                      borderStyle: 'solid',
                      borderColor: hasOpenAIKey ? 'var(--color-success)' : 'var(--border-secondary)'
                    }}>
                      {hasOpenAIKey ? '✓ Configured' : 'Not Configured'}
                    </span>
                  </div>
                  <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                    Required for GPT models. Your key is stored securely and never leaves your device.
                  </p>
                  <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <Input
                        type={showKey && provider === 'openai' ? 'text' : 'password'}
                        value={provider === 'openai' ? apiKey : ''}
                        onChange={(e) => {
                          setProvider('openai');
                          setApiKey(e.target.value);
                        }}
                        onFocus={() => {
                          setProvider('openai');
                          if (provider !== 'openai') {
                            setApiKey('');
                            setShowKey(false);
                          }
                        }}
                        placeholder="sk-..."
                        className="pr-20 font-mono text-sm"
                        disabled={isLoading}
                      />
                      {provider === 'openai' && apiKey && !apiKey.startsWith('•') && (
                        <button
                          onClick={() => setShowKey(!showKey)}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-xs px-2 py-1 transition-colors"
                          style={{ color: 'var(--text-secondary)' }}
                        >
                          {showKey ? '🙈 Hide' : '👁️ Show'}
                        </button>
                      )}
                    </div>
                    <button
                      onClick={() => {
                        setProvider('openai');
                        if (hasOpenAIKey) {
                          handleClear();
                        }
                      }}
                      disabled={isLoading || !hasOpenAIKey}
                      className="px-3 py-2 rounded transition-colors"
                      style={{
                        backgroundColor: 'transparent',
                        border: '1px solid var(--border-primary)',
                        color: hasOpenAIKey && !isLoading ? 'var(--color-error)' : 'var(--text-tertiary)',
                        opacity: hasOpenAIKey && !isLoading ? 1 : 0.5,
                        cursor: hasOpenAIKey && !isLoading ? 'pointer' : 'not-allowed'
                      }}
                      title={hasOpenAIKey ? 'Remove API key' : 'No API key to remove'}
                    >
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M2 4h12M5.333 4V2.667a.667.667 0 01.667-.667h4a.667.667 0 01.667.667V4m2 0v9.333a.667.667 0 01-.667.667H4a.667.667 0 01-.667-.667V4h9.334z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </button>
                  </div>
                  <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                    Don't have a key?{' '}
                    <a
                      href="https://platform.openai.com/api-keys"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline"
                      style={{ color: 'var(--accent-primary)' }}
                    >
                      Get one from OpenAI
                    </a>
                  </p>
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
              </div>
            )}
          </div>

          {/* Footer - only show for AI section */}
          {activeSection === 'ai' && (
            <div className="flex items-center justify-end px-6 py-4" style={{ backgroundColor: 'var(--bg-secondary)', borderTop: '1px solid var(--border-primary)' }}>
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
