import { useSyncExternalStore, useCallback } from 'react';

export interface EditorSettings {
  formatOnSave: boolean;
  indentSize: number;
  useTabs: boolean;
  vimMode: boolean;
  vimConfig: string;
  autoRenderOnIdle: boolean;
  autoRenderDelayMs: number;
}

export interface AppearanceSettings {
  theme: string;
}

export interface UiSettings {
  customizerWidth: number;
  hasCompletedNux: boolean;
  defaultLayoutPreset: 'default' | 'ai-first' | 'customizer-first';
  hasDismissedViewerControlsHint: boolean;
  fileTreeVisible: boolean;
  fileTreeWidth: number;
}

export type MeasurementUnit = 'mm' | 'cm' | 'in' | 'units';

export interface ViewerSettings {
  showAxes: boolean;
  showAxisLabels: boolean;
  show3DGrid: boolean;
  showShadows: boolean;
  showModelColors: boolean;
  showViewcube: boolean;
  measurementSnapEnabled: boolean;
  showSelectionInfo: boolean;
  show2DAxes: boolean;
  show2DGrid: boolean;
  show2DOrigin: boolean;
  show2DBounds: boolean;
  show2DCursorCoords: boolean;
  enable2DGridSnap: boolean;
  measurementUnit: MeasurementUnit;
}

export interface LibrarySettings {
  customPaths: string[];
  autoDiscoverSystem: boolean;
}

export interface PrivacySettings {
  analyticsEnabled: boolean;
}

export interface ProjectSettings {
  /** User-configured base directory for new projects. Empty string = use platform default. */
  defaultProjectDirectory: string;
}

export interface McpSettings {
  enabled: boolean;
  port: number;
}

export interface Settings {
  editor: EditorSettings;
  appearance: AppearanceSettings;
  ui: UiSettings;
  viewer: ViewerSettings;
  library: LibrarySettings;
  privacy: PrivacySettings;
  project: ProjectSettings;
  mcp: McpSettings;
}

const DEFAULT_VIM_CONFIG = `# Vim Configuration
# Use vim-style commands to customize your editor experience
# Lines starting with # are comments

# Popular escape mappings (exit insert mode)
map kj <Esc> insert
map jk <Esc> insert
map jj <Esc> insert

# Add your custom mappings below:
# Examples:
# map <Space>w :w<CR> normal
# map <C-h> <C-w>h normal
`;

function getSystemDefaultTheme(): string {
  try {
    return window.matchMedia('(prefers-color-scheme: light)').matches
      ? 'solarized-light'
      : 'solarized-dark';
  } catch {
    return 'solarized-dark';
  }
}

const DEFAULT_SETTINGS: Settings = {
  editor: {
    formatOnSave: true,
    indentSize: 4,
    useTabs: false,
    vimMode: false,
    vimConfig: DEFAULT_VIM_CONFIG,
    autoRenderOnIdle: false,
    autoRenderDelayMs: 500,
  },
  appearance: {
    theme: getSystemDefaultTheme(),
  },
  ui: {
    customizerWidth: 420,
    hasCompletedNux: true,
    defaultLayoutPreset: 'default',
    hasDismissedViewerControlsHint: false,
    fileTreeVisible: true,
    fileTreeWidth: 200,
  },
  viewer: {
    showAxes: true,
    showAxisLabels: true,
    show3DGrid: true,
    showShadows: true,
    showModelColors: true,
    showViewcube: true,
    measurementSnapEnabled: true,
    showSelectionInfo: true,
    show2DAxes: true,
    show2DGrid: true,
    show2DOrigin: true,
    show2DBounds: false,
    show2DCursorCoords: true,
    enable2DGridSnap: true,
    measurementUnit: 'mm',
  },
  library: {
    customPaths: [],
    autoDiscoverSystem: true,
  },
  privacy: {
    analyticsEnabled: true,
  },
  project: {
    defaultProjectDirectory: '',
  },
  mcp: {
    enabled: true,
    port: 32123,
  },
};

const SETTINGS_KEY = 'openscad-studio-settings';

/**
 * Load settings from localStorage
 */
export function loadSettings(): Settings {
  try {
    const stored = localStorage.getItem(SETTINGS_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      // Merge with defaults to handle new settings
      return {
        ...DEFAULT_SETTINGS,
        ...parsed,
        editor: {
          ...DEFAULT_SETTINGS.editor,
          ...(parsed.editor || {}),
        },
        appearance: {
          ...DEFAULT_SETTINGS.appearance,
          ...(parsed.appearance || {}),
        },
        ui: {
          ...DEFAULT_SETTINGS.ui,
          ...(parsed.ui || {}),
        },
        viewer: {
          ...DEFAULT_SETTINGS.viewer,
          ...(parsed.viewer || {}),
        },
        library: {
          ...DEFAULT_SETTINGS.library,
          ...(parsed.library || {}),
        },
        privacy: {
          ...DEFAULT_SETTINGS.privacy,
          ...(parsed.privacy || {}),
        },
        project: {
          ...DEFAULT_SETTINGS.project,
          ...(parsed.project || {}),
        },
        mcp: {
          ...DEFAULT_SETTINGS.mcp,
          ...(parsed.mcp || {}),
        },
      };
    }
  } catch (err) {
    console.error('Failed to load settings:', err);
  }
  return DEFAULT_SETTINGS;
}

const listeners: Set<() => void> = new Set();
let cachedSettings: Settings = loadSettings();

function notifyListeners() {
  cachedSettings = loadSettings();
  for (const listener of listeners) {
    listener();
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): Settings {
  return cachedSettings;
}

export function useSettings(): [Settings, (updates: Settings) => void] {
  const settings = useSyncExternalStore(subscribe, getSnapshot);
  const setSettings = useCallback((updated: Settings) => {
    saveSettings(updated);
  }, []);
  return [settings, setSettings];
}

export function saveSettings(settings: Settings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    notifyListeners();
  } catch (err) {
    console.error('Failed to save settings:', err);
  }
}

/**
 * Update a specific setting
 */
export function updateSetting<K extends keyof Settings>(
  category: K,
  updates: Partial<Settings[K]>
): Settings {
  const current = loadSettings();
  const updated = {
    ...current,
    [category]: {
      ...current[category],
      ...updates,
    },
  };
  saveSettings(updated);
  return updated;
}

/**
 * Reset settings to defaults
 */
export function resetSettings(): Settings {
  saveSettings(DEFAULT_SETTINGS);
  return DEFAULT_SETTINGS;
}

/**
 * Get default vim configuration
 */
export function getDefaultVimConfig(): string {
  return DEFAULT_VIM_CONFIG;
}
