import { useState, useEffect, useRef, useCallback } from 'react';
import {
  loadSettings,
  saveSettings,
  getDefaultVimConfig,
  type Settings,
} from '../stores/settingsStore';
import { getAvailableThemes, getTheme } from '../themes';
import { useTheme } from '../contexts/ThemeContext';
import { useAnalytics } from '../analytics/runtime';
import { Button, Input, Select, Label, Toggle } from './ui';
import { Editor as MonacoEditor } from '@monaco-editor/react';
import type * as Monaco from 'monaco-editor';
import { registerVimConfigLanguage } from '../languages/vimConfigLanguage';
import {
  TbPalette,
  TbBox,
  TbCode,
  TbSparkles,
  TbX,
  TbBooks,
  TbPlus,
  TbTrash,
  TbFolderOpen,
  TbShield,
} from 'react-icons/tb';
import {
  storeApiKey as storeApiKeyToStorage,
  clearApiKey as clearApiKeyFromStorage,
  hasApiKeyForProvider,
  getAvailableProviders as getAvailableProvidersFromStore,
} from '../stores/apiKeyStore';
import { getPlatform } from '../platform';
import { applyWorkspacePreset } from '../stores/layoutStore';
import { notifyError, notifySuccess } from '../utils/notifications';

interface SettingsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: SettingsSection;
}

function saveVimConfigIfChanged(localVimConfig: string, currentSettings: Settings) {
  if (localVimConfig !== currentSettings.editor.vimConfig) {
    const updated = {
      ...currentSettings,
      editor: {
        ...currentSettings.editor,
        vimConfig: localVimConfig,
      },
    };
    saveSettings(updated);
  }
}

export type SettingsSection = 'appearance' | 'viewer' | 'editor' | 'privacy' | 'ai' | 'libraries';
type EditorSubTab = 'general' | 'vim';

export function SettingsDialog({ isOpen, onClose, initialTab }: SettingsDialogProps) {
  const [activeSection, setActiveSection] = useState<SettingsSection>(initialTab ?? 'appearance');
  const [editorSubTab, setEditorSubTab] = useState<EditorSubTab>('general');
  const [settings, setSettings] = useState<Settings>(loadSettings());
  const [autoDiscoveredPaths, setAutoDiscoveredPaths] = useState<string[]>([]);
  const { updateTheme } = useTheme();
  const availableThemes = getAvailableThemes();
  const vimEditorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);

  // Local vim config state (not saved to settings until dialog closes)
  const [localVimConfig, setLocalVimConfig] = useState<string>(settings.editor.vimConfig);

  // AI Settings
  const [provider, setProvider] = useState<'anthropic' | 'openai'>('anthropic');
  const [apiKey, setApiKey] = useState('');
  const [hasAnthropicKey, setHasAnthropicKey] = useState(false);
  const [hasOpenAIKey, setHasOpenAIKey] = useState(false);
  const [isLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showKey, setShowKey] = useState(false);
  const lastTrackedSectionRef = useRef<SettingsSection | null>(null);
  const analytics = useAnalytics();

  const loadAISettings = useCallback(() => {
    const availableProviders = getAvailableProvidersFromStore();
    setHasAnthropicKey(availableProviders.includes('anthropic'));
    setHasOpenAIKey(availableProviders.includes('openai'));

    const hasCurrentKey = hasApiKeyForProvider(provider);
    if (hasCurrentKey) {
      setApiKey('••••••••••••••••••••••••••••••••••••••••••••');
    } else {
      setApiKey('');
    }
  }, [provider]);

  useEffect(() => {
    if (isOpen) {
      const loadedSettings = loadSettings();
      setSettings(loadedSettings);
      setLocalVimConfig(loadedSettings.editor.vimConfig);
      loadAISettings();
      if (initialTab) setActiveSection(initialTab);
      getPlatform().getLibraryPaths().then(setAutoDiscoveredPaths);
      lastTrackedSectionRef.current = null;
    }
  }, [isOpen, initialTab, loadAISettings]);

  useEffect(() => {
    if (!isOpen) {
      lastTrackedSectionRef.current = null;
      return;
    }

    if (activeSection === 'ai' && lastTrackedSectionRef.current !== 'ai') {
      analytics.track('ai settings opened', {
        source_surface: initialTab === 'ai' ? 'unknown' : 'ai_panel',
      });
    }

    lastTrackedSectionRef.current = activeSection;
  }, [activeSection, analytics, initialTab, isOpen]);

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
    saveSettings(updated);

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
  };

  const handleViewerSettingChange = <K extends keyof Settings['viewer']>(
    key: K,
    value: Settings['viewer'][K]
  ) => {
    const updated = {
      ...settings,
      viewer: {
        ...settings.viewer,
        [key]: value,
      },
    };
    setSettings(updated);
    saveSettings(updated);
  };

  const handleLibrarySettingChange = <K extends keyof Settings['library']>(
    key: K,
    value: Settings['library'][K]
  ) => {
    const updated = {
      ...settings,
      library: {
        ...settings.library,
        [key]: value,
      },
    };
    setSettings(updated);
    saveSettings(updated);
  };

  const handlePrivacySettingChange = <K extends keyof Settings['privacy']>(
    key: K,
    value: Settings['privacy'][K]
  ) => {
    const updated = {
      ...settings,
      privacy: {
        ...settings.privacy,
        [key]: value,
      },
    };
    setSettings(updated);
    saveSettings(updated);
  };

  const handleAddLibraryPath = async () => {
    try {
      const path = await getPlatform().pickDirectory();
      if (path) {
        if (settings.library.customPaths.includes(path)) return;
        const updatedPaths = [...settings.library.customPaths, path];
        handleLibrarySettingChange('customPaths', updatedPaths);
      }
    } catch (err) {
      notifyError({
        operation: 'add-library-path',
        error: err,
        fallbackMessage: 'Failed to add library path',
        toastId: 'add-library-path-error',
        logLabel: '[SettingsDialog] Failed to add library path',
      });
    }
  };

  const handleRemoveLibraryPath = (pathToRemove: string) => {
    const updatedPaths = settings.library.customPaths.filter((p) => p !== pathToRemove);
    handleLibrarySettingChange('customPaths', updatedPaths);
  };

  const handleSave = () => {
    if (!apiKey.trim() || apiKey.startsWith('•')) {
      setError('Please enter a valid API key');
      return;
    }

    setError(null);

    try {
      storeApiKeyToStorage(provider, apiKey);
      analytics.track('api key saved', {
        provider,
      });
      notifySuccess(`${provider === 'anthropic' ? 'Anthropic' : 'OpenAI'} API key saved`, {
        toastId: `save-api-key-${provider}`,
      });

      if (provider === 'anthropic') {
        setHasAnthropicKey(true);
      } else {
        setHasOpenAIKey(true);
      }

      setApiKey('••••••••••••••••••••••••••••••••••••••••••••');
      setShowKey(false);
    } catch (err) {
      notifyError({
        operation: 'save-api-key',
        error: err,
        fallbackMessage: 'Failed to save API key',
        toastId: `save-api-key-error-${provider}`,
        logLabel: '[SettingsDialog] Failed to save API key',
      });
    }
  };

  const handleClear = async () => {
    const confirmed = await getPlatform().confirm(
      `Are you sure you want to remove your ${provider === 'anthropic' ? 'Anthropic' : 'OpenAI'} API key?`,
      { title: 'Remove API Key', kind: 'warning', okLabel: 'Remove', cancelLabel: 'Cancel' }
    );
    if (!confirmed) return;

    setError(null);

    try {
      clearApiKeyFromStorage(provider);
      analytics.track('api key cleared', {
        provider,
      });
      notifySuccess('API key cleared', {
        toastId: `clear-api-key-${provider}`,
      });

      if (provider === 'anthropic') {
        setHasAnthropicKey(false);
      } else {
        setHasOpenAIKey(false);
      }

      setApiKey('');
    } catch (err) {
      notifyError({
        operation: 'clear-api-key',
        error: err,
        fallbackMessage: 'Failed to clear API key',
        toastId: `clear-api-key-error-${provider}`,
        logLabel: '[SettingsDialog] Failed to clear API key',
      });
    }
  };

  const handleClose = () => {
    // Save vim config changes before closing
    saveVimConfigIfChanged(localVimConfig, settings);
    onClose();
  };

  if (!isOpen) return null;

  const isDesktop = '__TAURI_INTERNALS__' in window;

  const navItems: { key: SettingsSection; label: string; icon: React.ReactNode }[] = [
    { key: 'appearance', label: 'Appearance', icon: <TbPalette size={16} /> },
    { key: 'viewer', label: 'Viewer', icon: <TbBox size={16} /> },
    { key: 'editor', label: 'Editor', icon: <TbCode size={16} /> },
    { key: 'privacy', label: 'Privacy', icon: <TbShield size={16} /> },
    ...(isDesktop
      ? [{ key: 'libraries' as const, label: 'Libraries', icon: <TbBooks size={16} /> }]
      : []),
    { key: 'ai', label: 'AI Assistant', icon: <TbSparkles size={16} /> },
  ];

  return (
    <div
      className="fixed inset-0 flex items-center justify-center z-50"
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)', backdropFilter: 'blur(4px)' }}
      onClick={handleClose}
    >
      <div
        className="rounded-xl shadow-2xl w-full max-w-3xl mx-4 flex h-[600px] overflow-hidden"
        style={{
          backgroundColor: 'var(--bg-secondary)',
          border: '1px solid var(--border-primary)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Left Sidebar */}
        <div
          className="w-52 flex flex-col"
          style={{
            backgroundColor: 'var(--bg-primary)',
            borderRight: '1px solid var(--border-primary)',
          }}
        >
          <div className="px-5 py-5">
            <h2
              className="text-sm font-semibold uppercase tracking-wider"
              style={{ color: 'var(--text-tertiary)' }}
            >
              Settings
            </h2>
          </div>
          <nav className="flex-1 px-3 space-y-1">
            {navItems.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setActiveSection(item.key)}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all duration-150"
                style={{
                  backgroundColor:
                    activeSection === item.key ? 'var(--accent-primary)' : 'transparent',
                  color:
                    activeSection === item.key ? 'var(--text-inverse)' : 'var(--text-secondary)',
                  fontWeight: activeSection === item.key ? '500' : 'normal',
                }}
                onMouseEnter={(e) => {
                  if (activeSection !== item.key) {
                    e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)';
                    e.currentTarget.style.color = 'var(--text-primary)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (activeSection !== item.key) {
                    e.currentTarget.style.backgroundColor = 'transparent';
                    e.currentTarget.style.color = 'var(--text-secondary)';
                  }
                }}
              >
                {item.icon}
                {item.label}
              </button>
            ))}
          </nav>
        </div>

        {/* Right Content */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Header */}
          <div
            className="flex items-center justify-between px-6 py-4 shrink-0"
            style={{ borderBottom: '1px solid var(--border-primary)' }}
          >
            <h3 className="text-sm font-medium" style={{ color: 'var(--text-tertiary)' }}>
              {activeSection === 'appearance'
                ? 'Appearance'
                : activeSection === 'viewer'
                  ? 'Viewer'
                  : activeSection === 'editor'
                    ? 'Editor'
                    : activeSection === 'privacy'
                      ? 'Privacy'
                      : activeSection === 'libraries'
                        ? 'Libraries'
                        : 'AI Assistant'}
            </h3>
            <button
              type="button"
              onClick={handleClose}
              className="flex items-center justify-center w-7 h-7 rounded-md transition-all duration-150"
              style={{ color: 'var(--text-tertiary)' }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)';
                e.currentTarget.style.color = 'var(--text-primary)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
                e.currentTarget.style.color = 'var(--text-tertiary)';
              }}
            >
              <TbX size={16} />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto px-6 py-5">
            {activeSection === 'appearance' && (
              <div className="space-y-6">
                <div>
                  <Label>Default Layout</Label>
                  <p className="text-xs mb-4" style={{ color: 'var(--text-tertiary)' }}>
                    Choose which panel arrangement to use as your default workspace
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { preset: 'default' as const, label: 'Editor First' },
                      { preset: 'ai-first' as const, label: 'AI First' },
                    ].map(({ preset, label }) => {
                      const isActive = settings.ui.defaultLayoutPreset === preset;
                      return (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => {
                            const updated = {
                              ...settings,
                              ui: { ...settings.ui, defaultLayoutPreset: preset },
                            };
                            setSettings(updated);
                            saveSettings(updated);
                            applyWorkspacePreset(preset);
                          }}
                          className="rounded-md p-3 text-left transition-all duration-150"
                          style={{
                            backgroundColor: 'var(--bg-primary)',
                            border: isActive
                              ? '2px solid var(--accent-primary)'
                              : '1px solid var(--border-primary)',
                            padding: isActive ? 'calc(0.75rem - 1px)' : undefined,
                            boxShadow: isActive ? '0 0 0 1px var(--accent-primary)' : undefined,
                          }}
                          onMouseEnter={(e) => {
                            if (!isActive) {
                              e.currentTarget.style.transform = 'translateY(-1px)';
                              e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.2)';
                            }
                          }}
                          onMouseLeave={(e) => {
                            if (!isActive) {
                              e.currentTarget.style.transform = 'none';
                              e.currentTarget.style.boxShadow = 'none';
                            }
                          }}
                        >
                          <span
                            className="text-sm"
                            style={{
                              color: 'var(--text-primary)',
                              fontWeight: isActive ? 600 : 400,
                            }}
                          >
                            {label}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <Label>Theme</Label>
                  <p className="text-xs mb-4" style={{ color: 'var(--text-tertiary)' }}>
                    Choose a color theme for the entire application
                  </p>
                  {availableThemes.map((section) => (
                    <div key={section.category} className="mb-4">
                      <div
                        className="text-xs font-semibold uppercase tracking-wider mb-2"
                        style={{ color: 'var(--text-tertiary)' }}
                      >
                        {section.category}
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        {section.themes.map((t) => {
                          const themeData = getTheme(t.id);
                          const isSelected = settings.appearance.theme === t.id;
                          return (
                            <button
                              key={t.id}
                              type="button"
                              onClick={() => handleAppearanceSettingChange('theme', t.id)}
                              className="flex flex-col rounded-md p-2.5 text-left transition-all duration-150"
                              style={{
                                backgroundColor: 'var(--bg-primary)',
                                border: isSelected
                                  ? '2px solid var(--accent-primary)'
                                  : '1px solid var(--border-primary)',
                                padding: isSelected ? 'calc(0.625rem - 1px)' : undefined,
                                boxShadow: isSelected
                                  ? '0 0 0 1px var(--accent-primary)'
                                  : undefined,
                              }}
                              onMouseEnter={(e) => {
                                if (!isSelected) {
                                  e.currentTarget.style.transform = 'translateY(-1px)';
                                  e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.2)';
                                }
                              }}
                              onMouseLeave={(e) => {
                                if (!isSelected) {
                                  e.currentTarget.style.transform = 'none';
                                  e.currentTarget.style.boxShadow = 'none';
                                }
                              }}
                            >
                              <span
                                className="text-xs mb-1.5 truncate w-full"
                                style={{
                                  color: 'var(--text-primary)',
                                  fontWeight: isSelected ? 600 : 400,
                                }}
                              >
                                {t.name}
                              </span>
                              <div className="flex h-3 rounded-sm overflow-hidden w-full">
                                <div
                                  className="flex-1"
                                  style={{ background: themeData.colors.bg.primary }}
                                />
                                <div
                                  className="flex-1"
                                  style={{ background: themeData.colors.accent.primary }}
                                />
                                <div
                                  className="flex-1"
                                  style={{ background: themeData.colors.text.primary }}
                                />
                                <div
                                  className="flex-1"
                                  style={{ background: themeData.colors.bg.secondary }}
                                />
                                <div
                                  className="flex-1"
                                  style={{ background: themeData.colors.semantic.error }}
                                />
                                <div
                                  className="flex-1"
                                  style={{ background: themeData.colors.semantic.success }}
                                />
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeSection === 'viewer' && (
              <div className="space-y-5">
                <div
                  className="rounded-lg"
                  style={{
                    backgroundColor: 'var(--bg-primary)',
                    border: '1px solid var(--border-primary)',
                  }}
                >
                  <div
                    className="flex items-center justify-between gap-4 p-4"
                    style={{ borderBottom: '1px solid var(--border-primary)' }}
                  >
                    <div className="pr-4">
                      <Label htmlFor="viewer-show-axes" className="mb-0">
                        Show axes
                      </Label>
                      <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
                        Show the X, Y, and Z reference axes in the 3D viewer
                      </p>
                    </div>
                    <Toggle
                      id="viewer-show-axes"
                      checked={settings.viewer.showAxes}
                      onChange={(event) =>
                        handleViewerSettingChange('showAxes', event.target.checked)
                      }
                    />
                  </div>

                  <div className="flex items-center justify-between gap-4 p-4">
                    <div className="pr-4">
                      <Label htmlFor="viewer-show-axis-labels" className="mb-0">
                        Show axis labels
                      </Label>
                      <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
                        Show numeric markers and X / Y / Z labels on the viewer axes
                      </p>
                    </div>
                    <Toggle
                      id="viewer-show-axis-labels"
                      checked={settings.viewer.showAxisLabels}
                      disabled={!settings.viewer.showAxes}
                      onChange={(event) =>
                        handleViewerSettingChange('showAxisLabels', event.target.checked)
                      }
                    />
                  </div>
                </div>

                <div
                  className="rounded-lg"
                  style={{
                    backgroundColor: 'var(--bg-primary)',
                    border: '1px solid var(--border-primary)',
                  }}
                >
                  <div
                    className="flex items-center justify-between gap-4 p-4"
                    style={{ borderBottom: '1px solid var(--border-primary)' }}
                  >
                    <div className="pr-4">
                      <p className="font-medium" style={{ color: 'var(--text-primary)' }}>
                        2D viewer
                      </p>
                      <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
                        Configure overlays and interaction aids used by the SVG preview.
                      </p>
                    </div>
                  </div>

                  <div
                    className="flex items-center justify-between gap-4 p-4"
                    style={{ borderTop: '1px solid var(--border-primary)' }}
                  >
                    <div className="pr-4">
                      <Label htmlFor="viewer-show-2d-grid" className="mb-0">
                        Show 2D grid
                      </Label>
                      <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
                        Show an adaptive grid in the SVG preview for layout and measurement.
                      </p>
                    </div>
                    <Toggle
                      id="viewer-show-2d-grid"
                      checked={settings.viewer.show2DGrid}
                      onChange={(event) =>
                        handleViewerSettingChange('show2DGrid', event.target.checked)
                      }
                    />
                  </div>

                  <div
                    className="flex items-center justify-between gap-4 p-4"
                    style={{ borderTop: '1px solid var(--border-primary)' }}
                  >
                    <div className="pr-4">
                      <Label htmlFor="viewer-show-2d-axes" className="mb-0">
                        Show 2D axes
                      </Label>
                      <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
                        Show horizontal and vertical reference axes through the origin.
                      </p>
                    </div>
                    <Toggle
                      id="viewer-show-2d-axes"
                      checked={settings.viewer.show2DAxes}
                      onChange={(event) =>
                        handleViewerSettingChange('show2DAxes', event.target.checked)
                      }
                    />
                  </div>

                  <div
                    className="flex items-center justify-between gap-4 p-4"
                    style={{ borderTop: '1px solid var(--border-primary)' }}
                  >
                    <div className="pr-4">
                      <Label htmlFor="viewer-show-2d-origin" className="mb-0">
                        Show origin marker
                      </Label>
                      <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
                        Show a highlighted marker at the SVG origin.
                      </p>
                    </div>
                    <Toggle
                      id="viewer-show-2d-origin"
                      checked={settings.viewer.show2DOrigin}
                      onChange={(event) =>
                        handleViewerSettingChange('show2DOrigin', event.target.checked)
                      }
                    />
                  </div>

                  <div
                    className="flex items-center justify-between gap-4 p-4"
                    style={{ borderTop: '1px solid var(--border-primary)' }}
                  >
                    <div className="pr-4">
                      <Label htmlFor="viewer-show-2d-bounds" className="mb-0">
                        Show drawing bounds
                      </Label>
                      <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
                        Show the drawing extents with width and height labels.
                      </p>
                    </div>
                    <Toggle
                      id="viewer-show-2d-bounds"
                      checked={settings.viewer.show2DBounds}
                      onChange={(event) =>
                        handleViewerSettingChange('show2DBounds', event.target.checked)
                      }
                    />
                  </div>

                  <div
                    className="flex items-center justify-between gap-4 p-4"
                    style={{ borderTop: '1px solid var(--border-primary)' }}
                  >
                    <div className="pr-4">
                      <Label htmlFor="viewer-show-2d-cursor-coords" className="mb-0">
                        Show cursor coordinates
                      </Label>
                      <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
                        Show live SVG coordinates for the current pointer location.
                      </p>
                    </div>
                    <Toggle
                      id="viewer-show-2d-cursor-coords"
                      checked={settings.viewer.show2DCursorCoords}
                      onChange={(event) =>
                        handleViewerSettingChange('show2DCursorCoords', event.target.checked)
                      }
                    />
                  </div>

                  <div
                    className="flex items-center justify-between gap-4 p-4"
                    style={{ borderTop: '1px solid var(--border-primary)' }}
                  >
                    <div className="pr-4">
                      <Label htmlFor="viewer-enable-2d-grid-snap" className="mb-0">
                        Snap measurement to grid
                      </Label>
                      <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
                        Snap measurement points to the origin, bounds corners, and grid when close.
                      </p>
                    </div>
                    <Toggle
                      id="viewer-enable-2d-grid-snap"
                      checked={settings.viewer.enable2DGridSnap}
                      onChange={(event) =>
                        handleViewerSettingChange('enable2DGridSnap', event.target.checked)
                      }
                    />
                  </div>
                </div>
              </div>
            )}

            {activeSection === 'editor' && (
              <div className="space-y-5">
                {/* Subtabs */}
                <div
                  className="inline-flex rounded-lg p-1"
                  style={{
                    backgroundColor: 'var(--bg-primary)',
                    border: '1px solid var(--border-primary)',
                  }}
                >
                  <button
                    type="button"
                    onClick={() => setEditorSubTab('general')}
                    className="px-4 py-1.5 text-sm rounded-md transition-all duration-150"
                    style={{
                      backgroundColor:
                        editorSubTab === 'general' ? 'var(--accent-primary)' : 'transparent',
                      color:
                        editorSubTab === 'general'
                          ? 'var(--text-inverse)'
                          : 'var(--text-secondary)',
                      fontWeight: editorSubTab === 'general' ? '500' : 'normal',
                    }}
                  >
                    General
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditorSubTab('vim')}
                    className="px-4 py-1.5 text-sm rounded-md transition-all duration-150"
                    style={{
                      backgroundColor:
                        editorSubTab === 'vim' ? 'var(--accent-primary)' : 'transparent',
                      color:
                        editorSubTab === 'vim' ? 'var(--text-inverse)' : 'var(--text-secondary)',
                      fontWeight: editorSubTab === 'vim' ? '500' : 'normal',
                    }}
                  >
                    Vim
                  </button>
                </div>

                {/* General Settings */}
                {editorSubTab === 'general' && (
                  <div
                    className="rounded-lg"
                    style={{
                      backgroundColor: 'var(--bg-primary)',
                      border: '1px solid var(--border-primary)',
                    }}
                  >
                    <div
                      className="flex items-center justify-between p-4"
                      style={{ borderBottom: '1px solid var(--border-primary)' }}
                    >
                      <div>
                        <Label className="mb-0">Format on Save</Label>
                        <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
                          Automatically format OpenSCAD code when saving files
                        </p>
                      </div>
                      <Toggle
                        checked={settings.editor.formatOnSave}
                        onChange={(e) =>
                          handleEditorSettingChange('formatOnSave', e.target.checked)
                        }
                      />
                    </div>

                    <div
                      className="p-4"
                      style={{ borderBottom: '1px solid var(--border-primary)' }}
                    >
                      <Label>Indent Size</Label>
                      <Select
                        value={settings.editor.indentSize}
                        onChange={(e) =>
                          handleEditorSettingChange('indentSize', Number(e.target.value))
                        }
                      >
                        <option value={2}>2 spaces</option>
                        <option value={4}>4 spaces</option>
                        <option value={8}>8 spaces</option>
                      </Select>
                    </div>

                    <div className="flex items-center justify-between p-4">
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

                    <div
                      className="flex items-center justify-between p-4"
                      style={{ borderBottom: '1px solid var(--border-primary)' }}
                    >
                      <div>
                        <Label className="mb-0">Auto-Render on Idle</Label>
                        <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
                          Automatically render preview after you stop typing
                        </p>
                      </div>
                      <Toggle
                        checked={settings.editor.autoRenderOnIdle}
                        onChange={(e) =>
                          handleEditorSettingChange('autoRenderOnIdle', e.target.checked)
                        }
                      />
                    </div>

                    {settings.editor.autoRenderOnIdle && (
                      <div
                        className="p-4"
                        style={{ borderBottom: '1px solid var(--border-primary)' }}
                      >
                        <Label>Render Delay</Label>
                        <Select
                          value={settings.editor.autoRenderDelayMs}
                          onChange={(e) =>
                            handleEditorSettingChange('autoRenderDelayMs', Number(e.target.value))
                          }
                        >
                          <option value={300}>300ms (fast)</option>
                          <option value={500}>500ms (default)</option>
                          <option value={1000}>1 second</option>
                          <option value={2000}>2 seconds</option>
                        </Select>
                      </div>
                    )}
                  </div>
                )}

                {/* Vim Settings */}
                {editorSubTab === 'vim' && (
                  <div className="space-y-4">
                    {/* Vim Mode Toggle */}
                    <div
                      className="flex items-center justify-between p-4 rounded-lg"
                      style={{
                        backgroundColor: 'var(--bg-primary)',
                        border: '1px solid var(--border-primary)',
                      }}
                    >
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
                      <div
                        className="rounded-lg p-4 space-y-3"
                        style={{
                          backgroundColor: 'var(--bg-primary)',
                          border: '1px solid var(--border-primary)',
                        }}
                      >
                        <div className="flex items-center justify-between">
                          <Label className="mb-0">Vim Configuration</Label>
                          <button
                            type="button"
                            onClick={() => setLocalVimConfig(getDefaultVimConfig())}
                            className="text-xs px-2.5 py-1 rounded-md transition-all duration-150"
                            style={{
                              color: 'var(--accent-primary)',
                              border: '1px solid var(--border-primary)',
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.backgroundColor = 'transparent';
                            }}
                          >
                            Reset to Defaults
                          </button>
                        </div>
                        <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                          Customize vim keybindings using vim-style commands. Lines starting with #
                          are comments.
                        </p>
                        <div
                          style={{
                            height: '260px',
                            border: '1px solid var(--border-primary)',
                            borderRadius: '6px',
                            overflow: 'hidden',
                          }}
                        >
                          <MonacoEditor
                            key={`vim-config-editor-${settings.editor.vimMode}`}
                            height="100%"
                            defaultLanguage="vimconfig"
                            theme={getTheme(settings.appearance.theme).monaco}
                            value={localVimConfig}
                            onChange={(val) => setLocalVimConfig(val ?? '')}
                            beforeMount={(monaco) => {
                              // Register vim config language before mounting
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
                                  try {
                                    monaco.editor.defineTheme(id, theme.monacoTheme);
                                  } catch {
                                    // Theme might already be registered, ignore error
                                  }
                                }
                              });
                            }}
                            onMount={(editor) => {
                              vimEditorRef.current = editor;

                              // Ensure this editor is completely independent
                              editor.updateOptions({
                                readOnly: false,
                                domReadOnly: false,
                              });

                              // Focus the editor to ensure it's active
                              editor.focus();
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
                              contextmenu: true,
                              // Ensure the editor captures all keyboard events
                              quickSuggestions: false,
                              parameterHints: { enabled: false },
                            }}
                          />
                        </div>
                        <div className="flex items-center justify-between pt-1">
                          <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                            Supported: <code style={{ color: 'var(--text-primary)' }}>map</code>,{' '}
                            <code style={{ color: 'var(--text-primary)' }}>imap</code>,{' '}
                            <code style={{ color: 'var(--text-primary)' }}>nmap</code>,{' '}
                            <code style={{ color: 'var(--text-primary)' }}>vmap</code>
                            {' • '}
                            Example:{' '}
                            <code style={{ color: 'var(--text-primary)' }}>
                              map kj &lt;Esc&gt; insert
                            </code>
                          </p>
                          <button
                            type="button"
                            onClick={() => {
                              handleEditorSettingChange('vimConfig', localVimConfig);
                            }}
                            disabled={localVimConfig === settings.editor.vimConfig}
                            className="text-sm px-4 py-1.5 rounded-md transition-all duration-150 shrink-0 ml-3"
                            style={{
                              backgroundColor:
                                localVimConfig !== settings.editor.vimConfig
                                  ? 'var(--accent-primary)'
                                  : 'transparent',
                              color:
                                localVimConfig !== settings.editor.vimConfig
                                  ? 'white'
                                  : 'var(--text-tertiary)',
                              border: '1px solid var(--border-primary)',
                              opacity: localVimConfig !== settings.editor.vimConfig ? 1 : 0.5,
                              cursor:
                                localVimConfig !== settings.editor.vimConfig
                                  ? 'pointer'
                                  : 'not-allowed',
                            }}
                          >
                            Apply
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {activeSection === 'privacy' && (
              <div className="space-y-5">
                <div
                  className="rounded-lg"
                  style={{
                    backgroundColor: 'var(--bg-primary)',
                    border: '1px solid var(--border-primary)',
                  }}
                >
                  <div
                    className="flex items-center justify-between gap-4 p-4"
                    style={{ borderBottom: '1px solid var(--border-primary)' }}
                  >
                    <div className="pr-4">
                      <Label className="mb-0">Share anonymous product analytics</Label>
                      <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
                        Anonymous product journeys help us understand how the app is used. Session
                        recording stays disabled.
                      </p>
                    </div>
                    <Toggle
                      checked={settings.privacy.analyticsEnabled}
                      onChange={(event) => {
                        const nextValue = event.target.checked;
                        handlePrivacySettingChange('analyticsEnabled', nextValue);
                        analytics.setAnalyticsEnabled(nextValue, {
                          capturePreferenceChange: true,
                        });
                      }}
                    />
                  </div>
                  <div className="grid gap-3 p-4 md:grid-cols-2">
                    <div
                      className="rounded-md p-3"
                      style={{
                        backgroundColor: 'var(--bg-secondary)',
                        border: '1px solid var(--border-primary)',
                      }}
                    >
                      <p
                        className="text-[11px] font-semibold uppercase tracking-[0.18em]"
                        style={{ color: 'var(--text-tertiary)' }}
                      >
                        What we collect
                      </p>
                      <p
                        className="text-xs mt-2 leading-5"
                        style={{ color: 'var(--text-secondary)' }}
                      >
                        OpenSCAD Studio uses a persistent anonymous identifier on this
                        device/browser to understand product journeys over time. Product
                        interactions may be autocaptured.
                      </p>
                    </div>
                    <div
                      className="rounded-md p-3"
                      style={{
                        backgroundColor: 'var(--bg-secondary)',
                        border: '1px solid var(--border-primary)',
                      }}
                    >
                      <p
                        className="text-[11px] font-semibold uppercase tracking-[0.18em]"
                        style={{ color: 'var(--text-tertiary)' }}
                      >
                        What stays out
                      </p>
                      <p
                        className="text-xs mt-2 leading-5"
                        style={{ color: 'var(--text-secondary)' }}
                      >
                        We do not intentionally send OpenSCAD code, AI prompt text, attachment
                        contents, API keys, diagnostics text, stack traces, or absolute file paths.
                      </p>
                    </div>
                    <div
                      className="rounded-md p-3"
                      style={{
                        backgroundColor: 'var(--bg-secondary)',
                        border: '1px solid var(--border-primary)',
                      }}
                    >
                      <p
                        className="text-[11px] font-semibold uppercase tracking-[0.18em]"
                        style={{ color: 'var(--text-tertiary)' }}
                      >
                        Turning it off
                      </p>
                      <p
                        className="text-xs mt-2 leading-5"
                        style={{ color: 'var(--text-secondary)' }}
                      >
                        Turning this off stops future analytics capture on this device/browser
                        immediately. It does not delete data already collected.
                      </p>
                    </div>
                    <div
                      className="rounded-md p-3"
                      style={{
                        backgroundColor: 'var(--bg-secondary)',
                        border: '1px solid var(--border-primary)',
                      }}
                    >
                      <p
                        className="text-[11px] font-semibold uppercase tracking-[0.18em]"
                        style={{ color: 'var(--text-tertiary)' }}
                      >
                        Where it applies
                      </p>
                      <p
                        className="text-xs mt-2 leading-5"
                        style={{ color: 'var(--text-secondary)' }}
                      >
                        This preference is stored locally and does not sync across devices or
                        accounts. On the web it applies per browser/profile. On desktop it applies
                        per installed app profile/webview storage.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeSection === 'libraries' && (
              <div className="space-y-6">
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <Label className="mb-0">Auto-discover System Libraries</Label>
                      <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
                        Automatically find OpenSCAD libraries in standard system locations
                      </p>
                    </div>
                    <Toggle
                      checked={settings.library.autoDiscoverSystem}
                      onChange={(e) =>
                        handleLibrarySettingChange('autoDiscoverSystem', e.target.checked)
                      }
                    />
                  </div>

                  {settings.library.autoDiscoverSystem && (
                    <div className="space-y-2">
                      <p
                        className="text-xs font-semibold uppercase tracking-wider mb-2"
                        style={{ color: 'var(--text-tertiary)' }}
                      >
                        System Paths
                      </p>
                      {autoDiscoveredPaths.length === 0 ? (
                        <div className="text-sm italic" style={{ color: 'var(--text-tertiary)' }}>
                          No system libraries found
                        </div>
                      ) : (
                        autoDiscoveredPaths.map((path) => (
                          <div
                            key={path}
                            className="flex items-center gap-2 text-sm p-2 rounded-md"
                            style={{
                              backgroundColor: 'var(--bg-primary)',
                              border: '1px solid var(--border-primary)',
                              opacity: 0.8,
                            }}
                          >
                            <span style={{ color: 'var(--color-success)' }}>✓</span>
                            <span
                              className="font-mono text-xs truncate"
                              style={{ color: 'var(--text-secondary)' }}
                            >
                              {path}
                            </span>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>

                <div>
                  <div className="flex items-center justify-between mb-3">
                    <p
                      className="text-xs font-semibold uppercase tracking-wider"
                      style={{ color: 'var(--text-tertiary)' }}
                    >
                      Custom Paths
                    </p>
                    <button
                      type="button"
                      onClick={handleAddLibraryPath}
                      className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-md transition-all duration-150"
                      style={{
                        color: 'var(--accent-primary)',
                        border: '1px solid var(--border-primary)',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = 'transparent';
                      }}
                    >
                      <TbPlus size={14} /> Add Path
                    </button>
                  </div>

                  <div className="space-y-2">
                    {settings.library.customPaths.length === 0 ? (
                      <div
                        className="text-sm italic p-4 text-center rounded-lg border border-dashed"
                        style={{
                          color: 'var(--text-tertiary)',
                          borderColor: 'var(--border-primary)',
                        }}
                      >
                        No custom library paths added
                      </div>
                    ) : (
                      settings.library.customPaths.map((path) => (
                        <div
                          key={path}
                          className="flex items-center justify-between gap-2 p-2 rounded-md group"
                          style={{
                            backgroundColor: 'var(--bg-primary)',
                            border: '1px solid var(--border-primary)',
                          }}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <TbFolderOpen size={16} style={{ color: 'var(--text-tertiary)' }} />
                            <span
                              className="font-mono text-xs truncate"
                              style={{ color: 'var(--text-primary)' }}
                            >
                              {path}
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleRemoveLibraryPath(path)}
                            className="p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity hover:bg-[var(--bg-tertiary)]"
                            style={{ color: 'var(--text-tertiary)' }}
                            title="Remove path"
                          >
                            <TbTrash size={14} />
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            )}

            {activeSection === 'ai' && (
              <div className="space-y-5 ph-no-capture">
                <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                  Add your API keys to enable AI assistant features. Model selection is available in
                  the chat interface.
                </p>

                {/* Anthropic Section */}
                <div
                  className="rounded-lg p-4 space-y-3 ph-no-capture"
                  style={{
                    backgroundColor: 'var(--bg-primary)',
                    border: '1px solid var(--border-primary)',
                  }}
                >
                  <div className="flex items-center gap-3">
                    <Label className="mb-0">Anthropic API Key</Label>
                    <span
                      className="text-xs px-2 py-0.5 rounded-full font-medium"
                      style={{
                        backgroundColor: hasAnthropicKey
                          ? 'rgba(133, 153, 0, 0.15)'
                          : 'rgba(128, 128, 128, 0.1)',
                        color: hasAnthropicKey ? 'var(--color-success)' : 'var(--text-tertiary)',
                      }}
                    >
                      {hasAnthropicKey ? 'Configured' : 'Not configured'}
                    </span>
                  </div>
                  <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                    Required for Claude models. Your key is stored locally on this device/browser
                    profile and used for direct requests to Anthropic from the app. It is not sent
                    to our analytics.
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
                        className="pr-20 font-mono text-sm ph-no-capture"
                        disabled={isLoading}
                      />
                      {provider === 'anthropic' && apiKey && !apiKey.startsWith('•') && (
                        <button
                          type="button"
                          onClick={() => setShowKey(!showKey)}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-xs px-2 py-1 rounded transition-colors"
                          style={{ color: 'var(--text-secondary)' }}
                        >
                          {showKey ? 'Hide' : 'Show'}
                        </button>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setProvider('anthropic');
                        if (hasAnthropicKey) {
                          handleClear();
                        }
                      }}
                      disabled={isLoading || !hasAnthropicKey}
                      className="flex items-center justify-center w-9 h-9 rounded-md transition-all duration-150 shrink-0"
                      style={{
                        backgroundColor: 'transparent',
                        border: '1px solid var(--border-primary)',
                        color:
                          hasAnthropicKey && !isLoading
                            ? 'var(--color-error)'
                            : 'var(--text-tertiary)',
                        opacity: hasAnthropicKey && !isLoading ? 1 : 0.4,
                        cursor: hasAnthropicKey && !isLoading ? 'pointer' : 'not-allowed',
                      }}
                      title={hasAnthropicKey ? 'Remove API key' : 'No API key to remove'}
                    >
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 16 16"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg"
                      >
                        <title>Delete</title>
                        <path
                          d="M2 4h12M5.333 4V2.667a.667.667 0 01.667-.667h4a.667.667 0 01.667.667V4m2 0v9.333a.667.667 0 01-.667.667H4a.667.667 0 01-.667-.667V4h9.334z"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
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
                <div
                  className="rounded-lg p-4 space-y-3 ph-no-capture"
                  style={{
                    backgroundColor: 'var(--bg-primary)',
                    border: '1px solid var(--border-primary)',
                  }}
                >
                  <div className="flex items-center gap-3">
                    <Label className="mb-0">OpenAI API Key</Label>
                    <span
                      className="text-xs px-2 py-0.5 rounded-full font-medium"
                      style={{
                        backgroundColor: hasOpenAIKey
                          ? 'rgba(133, 153, 0, 0.15)'
                          : 'rgba(128, 128, 128, 0.1)',
                        color: hasOpenAIKey ? 'var(--color-success)' : 'var(--text-tertiary)',
                      }}
                    >
                      {hasOpenAIKey ? 'Configured' : 'Not configured'}
                    </span>
                  </div>
                  <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                    Required for GPT models. Your key is stored locally on this device/browser
                    profile and used for direct requests to OpenAI from the app. It is not sent to
                    our analytics.
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
                        className="pr-20 font-mono text-sm ph-no-capture"
                        disabled={isLoading}
                      />
                      {provider === 'openai' && apiKey && !apiKey.startsWith('•') && (
                        <button
                          type="button"
                          onClick={() => setShowKey(!showKey)}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-xs px-2 py-1 rounded transition-colors"
                          style={{ color: 'var(--text-secondary)' }}
                        >
                          {showKey ? 'Hide' : 'Show'}
                        </button>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setProvider('openai');
                        if (hasOpenAIKey) {
                          handleClear();
                        }
                      }}
                      disabled={isLoading || !hasOpenAIKey}
                      className="flex items-center justify-center w-9 h-9 rounded-md transition-all duration-150 shrink-0"
                      style={{
                        backgroundColor: 'transparent',
                        border: '1px solid var(--border-primary)',
                        color:
                          hasOpenAIKey && !isLoading
                            ? 'var(--color-error)'
                            : 'var(--text-tertiary)',
                        opacity: hasOpenAIKey && !isLoading ? 1 : 0.4,
                        cursor: hasOpenAIKey && !isLoading ? 'pointer' : 'not-allowed',
                      }}
                      title={hasOpenAIKey ? 'Remove API key' : 'No API key to remove'}
                    >
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 16 16"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg"
                      >
                        <title>Delete</title>
                        <path
                          d="M2 4h12M5.333 4V2.667a.667.667 0 01.667-.667h4a.667.667 0 01.667.667V4m2 0v9.333a.667.667 0 01-.667.667H4a.667.667 0 01-.667-.667V4h9.334z"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
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
                  <div
                    className="flex items-center gap-2 px-4 py-3 rounded-lg text-sm"
                    style={{
                      backgroundColor: 'rgba(220, 50, 47, 0.1)',
                      border: '1px solid rgba(220, 50, 47, 0.3)',
                      color: 'var(--color-error)',
                    }}
                  >
                    {error}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          <div
            className="flex items-center justify-end gap-2 px-6 py-3 shrink-0"
            style={{ borderTop: '1px solid var(--border-primary)' }}
          >
            {activeSection === 'ai' && (
              <Button
                variant="primary"
                onClick={handleSave}
                disabled={isLoading || !apiKey.trim() || apiKey.startsWith('•')}
              >
                {isLoading ? 'Saving...' : 'Save Key'}
              </Button>
            )}
            <Button variant="ghost" onClick={handleClose} disabled={isLoading}>
              {activeSection === 'ai' ? 'Cancel' : 'Close'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
