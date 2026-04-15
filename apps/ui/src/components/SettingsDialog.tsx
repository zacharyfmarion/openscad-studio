import { useState, useEffect, useCallback, useRef } from 'react';
import { loadSettings, saveSettings, type Settings } from '../stores/settingsStore';
import { useTheme } from '../contexts/ThemeContext';
import {
  useAnalytics,
  type LayoutSelectionSource,
  type ViewerPreferenceKey,
} from '../analytics/runtime';
import { Button, IconButton, Text } from './ui';
import {
  TbPalette,
  TbBox,
  TbCode,
  TbSparkles,
  TbX,
  TbBooks,
  TbShield,
  TbRuler,
} from 'react-icons/tb';
import { getPlatform } from '../platform';
import { applyWorkspacePreset } from '../stores/layoutStore';
import { notifyError } from '../utils/notifications';
import {
  AppearanceSettings,
  ViewerSettings,
  ProjectSettings,
  EditorSettings,
  PrivacySettings,
  LibrariesSettings,
  AiSettings,
} from './settings';
import type { AiSettingsHandle } from './settings/AiSettings';

export type SettingsSection =
  | 'appearance'
  | 'viewer'
  | 'editor'
  | 'privacy'
  | 'ai'
  | 'libraries'
  | 'project';

interface SettingsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: SettingsSection;
}

function saveVimConfig(localVimConfig: string, currentSettings: Settings) {
  if (localVimConfig !== currentSettings.editor.vimConfig) {
    const updated = {
      ...currentSettings,
      editor: { ...currentSettings.editor, vimConfig: localVimConfig },
    };
    saveSettings(updated);
  }
}

export function SettingsDialog({ isOpen, onClose, initialTab }: SettingsDialogProps) {
  const [activeSection, setActiveSection] = useState<SettingsSection>(initialTab ?? 'appearance');
  const [settings, setSettings] = useState<Settings>(loadSettings());
  const [autoDiscoveredPaths, setAutoDiscoveredPaths] = useState<string[]>([]);
  const [localVimConfig, setLocalVimConfig] = useState<string>(settings.editor.vimConfig);

  const [aiCanSave, setAiCanSave] = useState(false);
  const aiRef = useRef<AiSettingsHandle>(null);

  const { updateTheme } = useTheme();
  const analytics = useAnalytics();
  const lastTrackedSectionRef = { current: null as SettingsSection | null };

  useEffect(() => {
    if (isOpen) {
      const loaded = loadSettings();
      setSettings(loaded);
      setLocalVimConfig(loaded.editor.vimConfig);
      if (initialTab) setActiveSection(initialTab);
      getPlatform().getLibraryPaths().then(setAutoDiscoveredPaths);
      lastTrackedSectionRef.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, initialTab]);

  useEffect(() => {
    if (!isOpen) return;
    if (activeSection === 'ai' && lastTrackedSectionRef.current !== 'ai') {
      analytics.track('ai settings opened', {
        source_surface: initialTab === 'ai' ? 'unknown' : 'ai_panel',
      });
    }
    lastTrackedSectionRef.current = activeSection;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSection, isOpen]);

  const handleAppearanceChange = useCallback(
    <K extends keyof Settings['appearance']>(key: K, value: Settings['appearance'][K]) => {
      const updated = { ...settings, appearance: { ...settings.appearance, [key]: value } };
      setSettings(updated);
      saveSettings(updated);
      if (key === 'theme') updateTheme(value as string);
    },
    [settings, updateTheme]
  );

  const handleEditorChange = useCallback(
    <K extends keyof Settings['editor']>(key: K, value: Settings['editor'][K]) => {
      const updated = { ...settings, editor: { ...settings.editor, [key]: value } };
      setSettings(updated);
      saveSettings(updated);
    },
    [settings]
  );

  const handleProjectChange = useCallback(
    <K extends keyof Settings['project']>(key: K, value: Settings['project'][K]) => {
      const updated = { ...settings, project: { ...settings.project, [key]: value } };
      setSettings(updated);
      saveSettings(updated);
    },
    [settings]
  );

  const handleViewerChange = useCallback(
    <K extends keyof Settings['viewer']>(key: K, value: Settings['viewer'][K]) => {
      const updated = { ...settings, viewer: { ...settings.viewer, [key]: value } };
      setSettings(updated);
      saveSettings(updated);

      if (key === 'measurementUnit') {
        analytics.track('viewer preference changed', {
          setting: 'measurement_unit' satisfies ViewerPreferenceKey,
          value,
        });
      }
      if (key === 'measurementSnapEnabled') {
        analytics.track('viewer preference changed', {
          setting: 'measurement_snap_enabled' satisfies ViewerPreferenceKey,
          enabled: value,
        });
      }
      if (key === 'showModelColors') {
        analytics.track('viewer preference changed', {
          setting: 'show_model_colors' satisfies ViewerPreferenceKey,
          enabled: value,
        });
      }
    },
    [settings, analytics]
  );

  const handleDefaultLayoutChange = useCallback(
    (preset: Settings['ui']['defaultLayoutPreset']) => {
      const changed = settings.ui.defaultLayoutPreset !== preset;
      const updated = { ...settings, ui: { ...settings.ui, defaultLayoutPreset: preset } };
      setSettings(updated);
      saveSettings(updated);
      if (changed) {
        analytics.track('workspace layout selected', {
          layout: preset,
          source: 'settings' satisfies LayoutSelectionSource,
          is_first_run: false,
        });
      }
      applyWorkspacePreset(preset);
    },
    [settings, analytics]
  );

  const handlePrivacyChange = useCallback(
    <K extends keyof Settings['privacy']>(key: K, value: Settings['privacy'][K]) => {
      const updated = { ...settings, privacy: { ...settings.privacy, [key]: value } };
      setSettings(updated);
      saveSettings(updated);
    },
    [settings]
  );

  const handleLibraryChange = useCallback(
    <K extends keyof Settings['library']>(key: K, value: Settings['library'][K]) => {
      const updated = { ...settings, library: { ...settings.library, [key]: value } };
      setSettings(updated);
      saveSettings(updated);
    },
    [settings]
  );

  const handleAddLibraryPath = useCallback(async () => {
    try {
      const path = await getPlatform().pickDirectory();
      if (path) {
        if (settings.library.customPaths.includes(path)) return;
        handleLibraryChange('customPaths', [...settings.library.customPaths, path]);
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
  }, [settings, handleLibraryChange]);

  const handleRemoveLibraryPath = useCallback(
    (pathToRemove: string) => {
      handleLibraryChange(
        'customPaths',
        settings.library.customPaths.filter((p) => p !== pathToRemove)
      );
    },
    [settings, handleLibraryChange]
  );

  const handleClose = useCallback(() => {
    saveVimConfig(localVimConfig, settings);
    onClose();
  }, [localVimConfig, settings, onClose]);

  if (!isOpen) return null;

  const isDesktop = '__TAURI_INTERNALS__' in window;

  const navItems: { key: SettingsSection; label: string; icon: React.ReactNode }[] = [
    { key: 'appearance', label: 'Appearance', icon: <TbPalette size={16} /> },
    { key: 'viewer', label: 'Viewer', icon: <TbBox size={16} /> },
    { key: 'editor', label: 'Editor', icon: <TbCode size={16} /> },
    { key: 'project', label: 'Project', icon: <TbRuler size={16} /> },
    { key: 'privacy', label: 'Privacy', icon: <TbShield size={16} /> },
    ...(isDesktop
      ? [{ key: 'libraries' as const, label: 'Libraries', icon: <TbBooks size={16} /> }]
      : []),
    { key: 'ai', label: 'AI Assistant', icon: <TbSparkles size={16} /> },
  ];

  const sectionTitle: Record<SettingsSection, string> = {
    appearance: 'Appearance',
    viewer: 'Viewer',
    editor: 'Editor',
    project: 'Project',
    privacy: 'Privacy',
    libraries: 'Libraries',
    ai: 'AI Assistant',
  };

  return (
    <div
      className="fixed inset-0 flex items-center justify-center z-50"
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)', backdropFilter: 'blur(4px)' }}
      onClick={handleClose}
    >
      <div
        className="rounded-2xl shadow-2xl w-full max-w-3xl mx-4 flex h-[600px] overflow-hidden"
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
          <div style={{ padding: 'var(--space-dialog-padding-y) var(--space-5)' }}>
            <Text
              variant="section-heading"
              as="h2"
              className="uppercase tracking-wider"
              color="tertiary"
            >
              Settings
            </Text>
          </div>
          <nav className="flex-1 px-3 flex flex-col" style={{ gap: 'var(--space-1)' }}>
            {/* eslint-disable no-restricted-syntax -- nav items need imperative onMouseEnter/Leave to swap bg/color without extra state; <Button> doesn't expose those overrides cleanly */}
            {navItems.map((item) => (
              <button
                key={item.key}
                type="button"
                data-testid={`settings-nav-${item.key}`}
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
            {/* eslint-enable no-restricted-syntax */}
          </nav>
        </div>

        {/* Right Content */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Header */}
          <div
            className="flex items-center justify-between shrink-0"
            style={{
              borderBottom: '1px solid var(--border-primary)',
              padding: `var(--space-4) var(--space-dialog-padding-x)`,
            }}
          >
            <Text variant="section-heading" weight="medium" color="tertiary">
              {sectionTitle[activeSection]}
            </Text>
            <IconButton
              size="sm"
              onClick={handleClose}
              title="Close settings"
              aria-label="Close settings"
              data-testid="settings-close-button"
            >
              <TbX size={16} />
            </IconButton>
          </div>

          {/* Content */}
          <div
            className="flex-1 overflow-y-auto"
            style={{ padding: `var(--space-dialog-padding-y) var(--space-dialog-padding-x)` }}
          >
            {activeSection === 'appearance' && (
              <AppearanceSettings
                settings={settings}
                onAppearanceChange={handleAppearanceChange}
                onDefaultLayoutChange={handleDefaultLayoutChange}
              />
            )}
            {activeSection === 'viewer' && (
              <ViewerSettings settings={settings} onViewerChange={handleViewerChange} />
            )}
            {activeSection === 'project' && (
              <ProjectSettings
                settings={settings}
                onViewerChange={handleViewerChange}
                onProjectChange={handleProjectChange}
              />
            )}
            {activeSection === 'editor' && (
              <EditorSettings
                settings={settings}
                onEditorChange={handleEditorChange}
                localVimConfig={localVimConfig}
                onLocalVimConfigChange={setLocalVimConfig}
              />
            )}
            {activeSection === 'privacy' && (
              <PrivacySettings settings={settings} onPrivacyChange={handlePrivacyChange} />
            )}
            {activeSection === 'libraries' && (
              <LibrariesSettings
                settings={settings}
                autoDiscoveredPaths={autoDiscoveredPaths}
                onLibraryChange={handleLibraryChange}
                onAddPath={handleAddLibraryPath}
                onRemovePath={handleRemoveLibraryPath}
              />
            )}
            {activeSection === 'ai' && (
              <AiSettings ref={aiRef} isOpen={isOpen} onCanSaveChange={setAiCanSave} />
            )}
          </div>

          {/* Footer */}
          <div
            className="flex items-center justify-end shrink-0"
            style={{
              borderTop: '1px solid var(--border-primary)',
              gap: 'var(--space-dialog-footer-gap)',
              padding: `var(--space-3) var(--space-dialog-padding-x)`,
            }}
          >
            {activeSection === 'ai' && (
              <Button variant="primary" onClick={() => aiRef.current?.save()} disabled={!aiCanSave}>
                Save Key
              </Button>
            )}
            <Button variant="ghost" onClick={handleClose}>
              {activeSection === 'ai' ? 'Cancel' : 'Close'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
