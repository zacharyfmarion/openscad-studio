/**
 * Unified Theming System
 *
 * Provides consistent theming across the entire application.
 * Includes editor and UI themes.
 */

export interface ThemeColors {
  // Base colors
  bg: {
    primary: string;      // Main background
    secondary: string;    // Secondary panels
    tertiary: string;     // Hover states, borders
    elevated: string;     // Elevated elements (dialogs, dropdowns)
  };

  text: {
    primary: string;      // Main text
    secondary: string;    // Secondary text, labels
    tertiary: string;     // Disabled, placeholder
    inverse: string;      // Text on accent colors
  };

  border: {
    primary: string;      // Main borders
    secondary: string;    // Subtle borders
    focus: string;        // Focus rings
  };

  accent: {
    primary: string;      // Primary accent (buttons, links)
    secondary: string;    // Secondary accent
    hover: string;        // Hover state
  };

  semantic: {
    error: string;
    warning: string;
    success: string;
    info: string;
  };

  // Editor-specific (for Monaco)
  editor: {
    background: string;
    foreground: string;
    lineHighlight: string;
    selection: string;
    cursor: string;
  };
}

export interface Theme {
  id: string;
  name: string;
  monaco: string;
  colors: ThemeColors;
  monacoTheme?: any; // Monaco theme definition
}

// Solarized Dark Theme
export const solarizedDark: Theme = {
  id: 'solarized-dark',
  name: 'Solarized Dark',
  monaco: 'solarized-dark',
  colors: {
    bg: {
      primary: '#002b36',     // base03
      secondary: '#073642',   // base02
      tertiary: '#586e75',    // base01
      elevated: '#073642',    // base02
    },
    text: {
      primary: '#839496',     // base0
      secondary: '#93a1a1',   // base1
      tertiary: '#586e75',    // base01
      inverse: '#fdf6e3',     // base3
    },
    border: {
      primary: '#073642',     // base02
      secondary: '#586e75',   // base01
      focus: '#268bd2',       // blue
    },
    accent: {
      primary: '#268bd2',     // blue
      secondary: '#2aa198',   // cyan
      hover: '#6c71c4',       // violet
    },
    semantic: {
      error: '#dc322f',       // red
      warning: '#b58900',     // yellow
      success: '#859900',     // green
      info: '#268bd2',        // blue
    },
    editor: {
      background: '#002b36',
      foreground: '#839496',
      lineHighlight: '#073642',
      selection: '#073642',
      cursor: '#839496',
    },
  },
  monacoTheme: {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'comment', foreground: '586e75', fontStyle: 'italic' },
      { token: 'keyword', foreground: '859900' },
      { token: 'type', foreground: 'b58900' },
      { token: 'identifier', foreground: '839496' },
      { token: 'number', foreground: '2aa198' },
      { token: 'string', foreground: '2aa198' },
      { token: 'string.invalid', foreground: 'dc322f' },
    ],
    colors: {
      'editor.background': '#002b36',
      'editor.foreground': '#839496',
      'editor.lineHighlightBackground': '#073642',
      'editor.selectionBackground': '#073642',
      'editorCursor.foreground': '#839496',
      'editorLineNumber.foreground': '#586e75',
      'editorLineNumber.activeForeground': '#93a1a1',
      'editorIndentGuide.background': '#073642',
      'editorIndentGuide.activeBackground': '#586e75',
      'editorWhitespace.foreground': '#073642',
    },
  },
};

// Solarized Light Theme
export const solarizedLight: Theme = {
  id: 'solarized-light',
  name: 'Solarized Light',
  monaco: 'solarized-light',
  colors: {
    bg: {
      primary: '#fdf6e3',     // base3
      secondary: '#eee8d5',   // base2
      tertiary: '#93a1a1',    // base1
      elevated: '#eee8d5',    // base2
    },
    text: {
      primary: '#657b83',     // base00
      secondary: '#586e75',   // base01
      tertiary: '#93a1a1',    // base1
      inverse: '#002b36',     // base03
    },
    border: {
      primary: '#eee8d5',     // base2
      secondary: '#93a1a1',   // base1
      focus: '#268bd2',       // blue
    },
    accent: {
      primary: '#268bd2',     // blue
      secondary: '#2aa198',   // cyan
      hover: '#6c71c4',       // violet
    },
    semantic: {
      error: '#dc322f',       // red
      warning: '#b58900',     // yellow
      success: '#859900',     // green
      info: '#268bd2',        // blue
    },
    editor: {
      background: '#fdf6e3',
      foreground: '#657b83',
      lineHighlight: '#eee8d5',
      selection: '#eee8d5',
      cursor: '#657b83',
    },
  },
  monacoTheme: {
    base: 'vs',
    inherit: true,
    rules: [
      { token: 'comment', foreground: '93a1a1', fontStyle: 'italic' },
      { token: 'keyword', foreground: '859900' },
      { token: 'type', foreground: 'b58900' },
      { token: 'identifier', foreground: '657b83' },
      { token: 'number', foreground: '2aa198' },
      { token: 'string', foreground: '2aa198' },
      { token: 'string.invalid', foreground: 'dc322f' },
    ],
    colors: {
      'editor.background': '#fdf6e3',
      'editor.foreground': '#657b83',
      'editor.lineHighlightBackground': '#eee8d5',
      'editor.selectionBackground': '#eee8d5',
      'editorCursor.foreground': '#657b83',
      'editorLineNumber.foreground': '#93a1a1',
      'editorLineNumber.activeForeground': '#586e75',
      'editorIndentGuide.background': '#eee8d5',
      'editorIndentGuide.activeBackground': '#93a1a1',
      'editorWhitespace.foreground': '#eee8d5',
    },
  },
};

// Theme registry
export const themes: Record<string, Theme> = {
  'solarized-dark': solarizedDark,
  'solarized-light': solarizedLight,
};

// Default theme
export const DEFAULT_THEME_ID = 'solarized-dark';

/**
 * Get theme by ID
 */
export function getTheme(id: string): Theme {
  return themes[id] || themes[DEFAULT_THEME_ID];
}

/**
 * Apply theme to document as CSS variables
 */
export function applyTheme(theme: Theme): void {
  const root = document.documentElement;

  // Apply all color variables
  root.style.setProperty('--bg-primary', theme.colors.bg.primary);
  root.style.setProperty('--bg-secondary', theme.colors.bg.secondary);
  root.style.setProperty('--bg-tertiary', theme.colors.bg.tertiary);
  root.style.setProperty('--bg-elevated', theme.colors.bg.elevated);

  root.style.setProperty('--text-primary', theme.colors.text.primary);
  root.style.setProperty('--text-secondary', theme.colors.text.secondary);
  root.style.setProperty('--text-tertiary', theme.colors.text.tertiary);
  root.style.setProperty('--text-inverse', theme.colors.text.inverse);

  root.style.setProperty('--border-primary', theme.colors.border.primary);
  root.style.setProperty('--border-secondary', theme.colors.border.secondary);
  root.style.setProperty('--border-focus', theme.colors.border.focus);

  root.style.setProperty('--accent-primary', theme.colors.accent.primary);
  root.style.setProperty('--accent-secondary', theme.colors.accent.secondary);
  root.style.setProperty('--accent-hover', theme.colors.accent.hover);

  root.style.setProperty('--color-error', theme.colors.semantic.error);
  root.style.setProperty('--color-warning', theme.colors.semantic.warning);
  root.style.setProperty('--color-success', theme.colors.semantic.success);
  root.style.setProperty('--color-info', theme.colors.semantic.info);

  root.style.setProperty('--editor-bg', theme.colors.editor.background);
  root.style.setProperty('--editor-fg', theme.colors.editor.foreground);
}

/**
 * Get list of available themes
 */
export function getAvailableThemes(): Array<{ id: string; name: string }> {
  return Object.values(themes).map(theme => ({
    id: theme.id,
    name: theme.name,
  }));
}
