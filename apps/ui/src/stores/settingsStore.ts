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
  defaultLayoutPreset: 'default' | 'ai-first';
}

export interface LibrarySettings {
  customPaths: string[];
  autoDiscoverSystem: boolean;
}

export interface Settings {
  editor: EditorSettings;
  appearance: AppearanceSettings;
  ui: UiSettings;
  library: LibrarySettings;
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
    hasCompletedNux: false,
    defaultLayoutPreset: 'default',
  },
  library: {
    customPaths: [],
    autoDiscoverSystem: true,
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
        library: {
          ...DEFAULT_SETTINGS.library,
          ...(parsed.library || {}),
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
