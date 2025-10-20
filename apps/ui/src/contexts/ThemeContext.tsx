import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { loadSettings, saveSettings, type Settings } from '../stores/settingsStore';
import { getTheme, applyTheme, type Theme } from '../themes';

interface ThemeContextValue {
  theme: Theme;
  themeId: string;
  updateTheme: (themeId: string) => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

interface ThemeProviderProps {
  children: ReactNode;
}

export function ThemeProvider({ children }: ThemeProviderProps) {
  const [themeId, setThemeId] = useState(() => {
    const settings = loadSettings();
    return settings.appearance.theme;
  });

  const [theme, setTheme] = useState(() => getTheme(themeId));

  // Apply theme whenever it changes
  useEffect(() => {
    const newTheme = getTheme(themeId);
    setTheme(newTheme);
    applyTheme(newTheme);
  }, [themeId]);

  const updateTheme = (newThemeId: string) => {
    setThemeId(newThemeId);

    // Update settings in localStorage
    const settings = loadSettings();
    const updated: Settings = {
      ...settings,
      appearance: {
        ...settings.appearance,
        theme: newThemeId,
      },
    };
    saveSettings(updated);
  };

  return (
    <ThemeContext.Provider value={{ theme, themeId, updateTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
