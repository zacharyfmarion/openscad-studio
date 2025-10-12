/**
 * Settings Store
 *
 * Centralized settings management with localStorage persistence
 */

export interface EditorSettings {
  formatOnSave: boolean;
  indentSize: number;
  useTabs: boolean;
}

export interface Settings {
  editor: EditorSettings;
}

const DEFAULT_SETTINGS: Settings = {
  editor: {
    formatOnSave: true,
    indentSize: 4,
    useTabs: false,
  },
};

const SETTINGS_KEY = 'openscad-copilot-settings';

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
