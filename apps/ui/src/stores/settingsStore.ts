/**
 * Settings Store
 *
 * Centralized settings management with localStorage persistence
 */

export interface EditorSettings {
  formatOnSave: boolean;
  indentSize: number;
  useTabs: boolean;
  vimMode: boolean;
  vimConfig: string;
}

export interface AppearanceSettings {
  theme: string;
}

export interface UiSettings {
  customizerWidth: number; // Width of customizer panel in pixels
}

export interface Settings {
  editor: EditorSettings;
  appearance: AppearanceSettings;
  ui: UiSettings;
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

const DEFAULT_SETTINGS: Settings = {
  editor: {
    formatOnSave: true,
    indentSize: 4,
    useTabs: false,
    vimMode: false,
    vimConfig: DEFAULT_VIM_CONFIG,
  },
  appearance: {
    theme: 'solarized-dark',
  },
  ui: {
    customizerWidth: 420,
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
      };
    }
  } catch (err) {
    console.error('Failed to load settings:', err);
  }
  return DEFAULT_SETTINGS;
}

/**
 * Save settings to localStorage
 */
export function saveSettings(settings: Settings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
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
