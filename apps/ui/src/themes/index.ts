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

import type * as Monaco from 'monaco-editor';

export interface Theme {
  id: string;
  name: string;
  category: string;
  monaco: string;
  colors: ThemeColors;
  monacoTheme?: Monaco.editor.IStandaloneThemeData; // Monaco theme definition
}

// Solarized Dark Theme
export const solarizedDark: Theme = {
  id: 'solarized-dark',
  name: 'Solarized Dark',
  category: 'Classic',
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
  category: 'Classic',
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

// Monokai Theme
export const monokai: Theme = {
  id: 'monokai',
  name: 'Monokai',
  category: 'Popular Dark',
  monaco: 'monokai',
  colors: {
    bg: {
      primary: '#272822',
      secondary: '#1e1f1c',
      tertiary: '#49483e',
      elevated: '#2e2e2e',
    },
    text: {
      primary: '#f8f8f2',
      secondary: '#cfcfc2',
      tertiary: '#75715e',
      inverse: '#272822',
    },
    border: {
      primary: '#49483e',
      secondary: '#75715e',
      focus: '#66d9ef',
    },
    accent: {
      primary: '#66d9ef',
      secondary: '#a6e22e',
      hover: '#ae81ff',
    },
    semantic: {
      error: '#f92672',
      warning: '#e6db74',
      success: '#a6e22e',
      info: '#66d9ef',
    },
    editor: {
      background: '#272822',
      foreground: '#f8f8f2',
      lineHighlight: '#3e3d32',
      selection: '#49483e',
      cursor: '#f8f8f0',
    },
  },
  monacoTheme: {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'comment', foreground: '75715e', fontStyle: 'italic' },
      { token: 'keyword', foreground: 'f92672' },
      { token: 'type', foreground: '66d9ef' },
      { token: 'identifier', foreground: 'f8f8f2' },
      { token: 'number', foreground: 'ae81ff' },
      { token: 'string', foreground: 'e6db74' },
      { token: 'string.invalid', foreground: 'f92672' },
    ],
    colors: {
      'editor.background': '#272822',
      'editor.foreground': '#f8f8f2',
      'editor.lineHighlightBackground': '#3e3d32',
      'editor.selectionBackground': '#49483e',
      'editorCursor.foreground': '#f8f8f0',
      'editorLineNumber.foreground': '#90908a',
      'editorLineNumber.activeForeground': '#c2c2bf',
      'editorIndentGuide.background': '#49483e',
      'editorIndentGuide.activeBackground': '#75715e',
      'editorWhitespace.foreground': '#49483e',
    },
  },
};

// Dracula Theme
export const dracula: Theme = {
  id: 'dracula',
  name: 'Dracula',
  category: 'Popular Dark',
  monaco: 'dracula',
  colors: {
    bg: {
      primary: '#282a36',
      secondary: '#21222c',
      tertiary: '#44475a',
      elevated: '#343746',
    },
    text: {
      primary: '#f8f8f2',
      secondary: '#e6e6e6',
      tertiary: '#6272a4',
      inverse: '#282a36',
    },
    border: {
      primary: '#44475a',
      secondary: '#6272a4',
      focus: '#bd93f9',
    },
    accent: {
      primary: '#bd93f9',
      secondary: '#8be9fd',
      hover: '#ff79c6',
    },
    semantic: {
      error: '#ff5555',
      warning: '#f1fa8c',
      success: '#50fa7b',
      info: '#8be9fd',
    },
    editor: {
      background: '#282a36',
      foreground: '#f8f8f2',
      lineHighlight: '#44475a',
      selection: '#44475a',
      cursor: '#f8f8f2',
    },
  },
  monacoTheme: {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'comment', foreground: '6272a4', fontStyle: 'italic' },
      { token: 'keyword', foreground: 'ff79c6' },
      { token: 'type', foreground: '8be9fd' },
      { token: 'identifier', foreground: 'f8f8f2' },
      { token: 'number', foreground: 'bd93f9' },
      { token: 'string', foreground: 'f1fa8c' },
      { token: 'string.invalid', foreground: 'ff5555' },
    ],
    colors: {
      'editor.background': '#282a36',
      'editor.foreground': '#f8f8f2',
      'editor.lineHighlightBackground': '#44475a',
      'editor.selectionBackground': '#44475a',
      'editorCursor.foreground': '#f8f8f2',
      'editorLineNumber.foreground': '#6272a4',
      'editorLineNumber.activeForeground': '#f8f8f2',
      'editorIndentGuide.background': '#44475a',
      'editorIndentGuide.activeBackground': '#6272a4',
      'editorWhitespace.foreground': '#44475a',
    },
  },
};

// One Dark Pro Theme
export const oneDarkPro: Theme = {
  id: 'one-dark-pro',
  name: 'One Dark Pro',
  category: 'Popular Dark',
  monaco: 'one-dark-pro',
  colors: {
    bg: {
      primary: '#282c34',
      secondary: '#21252b',
      tertiary: '#3e4451',
      elevated: '#2c313c',
    },
    text: {
      primary: '#abb2bf',
      secondary: '#9da5b4',
      tertiary: '#5c6370',
      inverse: '#282c34',
    },
    border: {
      primary: '#3e4451',
      secondary: '#5c6370',
      focus: '#61afef',
    },
    accent: {
      primary: '#61afef',
      secondary: '#56b6c2',
      hover: '#c678dd',
    },
    semantic: {
      error: '#e06c75',
      warning: '#e5c07b',
      success: '#98c379',
      info: '#61afef',
    },
    editor: {
      background: '#282c34',
      foreground: '#abb2bf',
      lineHighlight: '#2c313c',
      selection: '#3e4451',
      cursor: '#528bff',
    },
  },
  monacoTheme: {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'comment', foreground: '5c6370', fontStyle: 'italic' },
      { token: 'keyword', foreground: 'c678dd' },
      { token: 'type', foreground: 'e5c07b' },
      { token: 'identifier', foreground: 'abb2bf' },
      { token: 'number', foreground: 'd19a66' },
      { token: 'string', foreground: '98c379' },
      { token: 'string.invalid', foreground: 'e06c75' },
    ],
    colors: {
      'editor.background': '#282c34',
      'editor.foreground': '#abb2bf',
      'editor.lineHighlightBackground': '#2c313c',
      'editor.selectionBackground': '#3e4451',
      'editorCursor.foreground': '#528bff',
      'editorLineNumber.foreground': '#5c6370',
      'editorLineNumber.activeForeground': '#abb2bf',
      'editorIndentGuide.background': '#3e4451',
      'editorIndentGuide.activeBackground': '#5c6370',
      'editorWhitespace.foreground': '#3e4451',
    },
  },
};

// GitHub Dark Theme
export const githubDark: Theme = {
  id: 'github-dark',
  name: 'GitHub Dark',
  category: 'Popular Dark',
  monaco: 'github-dark',
  colors: {
    bg: {
      primary: '#0d1117',
      secondary: '#161b22',
      tertiary: '#21262d',
      elevated: '#1c2128',
    },
    text: {
      primary: '#c9d1d9',
      secondary: '#8b949e',
      tertiary: '#6e7681',
      inverse: '#0d1117',
    },
    border: {
      primary: '#30363d',
      secondary: '#21262d',
      focus: '#58a6ff',
    },
    accent: {
      primary: '#58a6ff',
      secondary: '#56d364',
      hover: '#79c0ff',
    },
    semantic: {
      error: '#f85149',
      warning: '#d29922',
      success: '#56d364',
      info: '#58a6ff',
    },
    editor: {
      background: '#0d1117',
      foreground: '#c9d1d9',
      lineHighlight: '#161b22',
      selection: '#264f78',
      cursor: '#c9d1d9',
    },
  },
  monacoTheme: {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'comment', foreground: '8b949e', fontStyle: 'italic' },
      { token: 'keyword', foreground: 'ff7b72' },
      { token: 'type', foreground: 'ffa657' },
      { token: 'identifier', foreground: 'c9d1d9' },
      { token: 'number', foreground: '79c0ff' },
      { token: 'string', foreground: 'a5d6ff' },
      { token: 'string.invalid', foreground: 'f85149' },
    ],
    colors: {
      'editor.background': '#0d1117',
      'editor.foreground': '#c9d1d9',
      'editor.lineHighlightBackground': '#161b22',
      'editor.selectionBackground': '#264f78',
      'editorCursor.foreground': '#c9d1d9',
      'editorLineNumber.foreground': '#6e7681',
      'editorLineNumber.activeForeground': '#c9d1d9',
      'editorIndentGuide.background': '#21262d',
      'editorIndentGuide.activeBackground': '#30363d',
      'editorWhitespace.foreground': '#30363d',
    },
  },
};

// GitHub Light Theme
export const githubLight: Theme = {
  id: 'github-light',
  name: 'GitHub Light',
  category: 'Popular Light',
  monaco: 'github-light',
  colors: {
    bg: {
      primary: '#ffffff',
      secondary: '#f6f8fa',
      tertiary: '#d0d7de',
      elevated: '#f6f8fa',
    },
    text: {
      primary: '#24292f',
      secondary: '#57606a',
      tertiary: '#6e7781',
      inverse: '#ffffff',
    },
    border: {
      primary: '#d0d7de',
      secondary: '#e1e4e8',
      focus: '#0969da',
    },
    accent: {
      primary: '#0969da',
      secondary: '#1a7f37',
      hover: '#0550ae',
    },
    semantic: {
      error: '#cf222e',
      warning: '#9a6700',
      success: '#1a7f37',
      info: '#0969da',
    },
    editor: {
      background: '#ffffff',
      foreground: '#24292f',
      lineHighlight: '#f6f8fa',
      selection: '#0969da20',
      cursor: '#24292f',
    },
  },
  monacoTheme: {
    base: 'vs',
    inherit: true,
    rules: [
      { token: 'comment', foreground: '6e7781', fontStyle: 'italic' },
      { token: 'keyword', foreground: 'cf222e' },
      { token: 'type', foreground: '953800' },
      { token: 'identifier', foreground: '24292f' },
      { token: 'number', foreground: '0550ae' },
      { token: 'string', foreground: '0a3069' },
      { token: 'string.invalid', foreground: 'cf222e' },
    ],
    colors: {
      'editor.background': '#ffffff',
      'editor.foreground': '#24292f',
      'editor.lineHighlightBackground': '#f6f8fa',
      'editor.selectionBackground': '#0969da20',
      'editorCursor.foreground': '#24292f',
      'editorLineNumber.foreground': '#6e7781',
      'editorLineNumber.activeForeground': '#24292f',
      'editorIndentGuide.background': '#d0d7de',
      'editorIndentGuide.activeBackground': '#afb8c1',
      'editorWhitespace.foreground': '#d0d7de',
    },
  },
};

// Nord Theme
export const nord: Theme = {
  id: 'nord',
  name: 'Nord',
  category: 'Pastel & Cozy',
  monaco: 'nord',
  colors: {
    bg: {
      primary: '#2e3440',
      secondary: '#3b4252',
      tertiary: '#434c5e',
      elevated: '#3b4252',
    },
    text: {
      primary: '#d8dee9',
      secondary: '#e5e9f0',
      tertiary: '#4c566a',
      inverse: '#2e3440',
    },
    border: {
      primary: '#3b4252',
      secondary: '#4c566a',
      focus: '#88c0d0',
    },
    accent: {
      primary: '#88c0d0',
      secondary: '#81a1c1',
      hover: '#5e81ac',
    },
    semantic: {
      error: '#bf616a',
      warning: '#ebcb8b',
      success: '#a3be8c',
      info: '#88c0d0',
    },
    editor: {
      background: '#2e3440',
      foreground: '#d8dee9',
      lineHighlight: '#3b4252',
      selection: '#434c5e',
      cursor: '#d8dee9',
    },
  },
  monacoTheme: {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'comment', foreground: '616e88', fontStyle: 'italic' },
      { token: 'keyword', foreground: '81a1c1' },
      { token: 'type', foreground: '8fbcbb' },
      { token: 'identifier', foreground: 'd8dee9' },
      { token: 'number', foreground: 'b48ead' },
      { token: 'string', foreground: 'a3be8c' },
      { token: 'string.invalid', foreground: 'bf616a' },
    ],
    colors: {
      'editor.background': '#2e3440',
      'editor.foreground': '#d8dee9',
      'editor.lineHighlightBackground': '#3b4252',
      'editor.selectionBackground': '#434c5e',
      'editorCursor.foreground': '#d8dee9',
      'editorLineNumber.foreground': '#4c566a',
      'editorLineNumber.activeForeground': '#d8dee9',
      'editorIndentGuide.background': '#3b4252',
      'editorIndentGuide.activeBackground': '#4c566a',
      'editorWhitespace.foreground': '#3b4252',
    },
  },
};

// Tokyo Night Theme
export const tokyoNight: Theme = {
  id: 'tokyo-night',
  name: 'Tokyo Night',
  category: 'Popular Dark',
  monaco: 'tokyo-night',
  colors: {
    bg: {
      primary: '#1a1b26',
      secondary: '#16161e',
      tertiary: '#414868',
      elevated: '#24283b',
    },
    text: {
      primary: '#c0caf5',
      secondary: '#a9b1d6',
      tertiary: '#565f89',
      inverse: '#1a1b26',
    },
    border: {
      primary: '#292e42',
      secondary: '#414868',
      focus: '#7aa2f7',
    },
    accent: {
      primary: '#7aa2f7',
      secondary: '#73daca',
      hover: '#bb9af7',
    },
    semantic: {
      error: '#f7768e',
      warning: '#e0af68',
      success: '#9ece6a',
      info: '#7aa2f7',
    },
    editor: {
      background: '#1a1b26',
      foreground: '#c0caf5',
      lineHighlight: '#24283b',
      selection: '#414868',
      cursor: '#c0caf5',
    },
  },
  monacoTheme: {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'comment', foreground: '565f89', fontStyle: 'italic' },
      { token: 'keyword', foreground: 'bb9af7' },
      { token: 'type', foreground: '7dcfff' },
      { token: 'identifier', foreground: 'c0caf5' },
      { token: 'number', foreground: 'ff9e64' },
      { token: 'string', foreground: '9ece6a' },
      { token: 'string.invalid', foreground: 'f7768e' },
    ],
    colors: {
      'editor.background': '#1a1b26',
      'editor.foreground': '#c0caf5',
      'editor.lineHighlightBackground': '#24283b',
      'editor.selectionBackground': '#414868',
      'editorCursor.foreground': '#c0caf5',
      'editorLineNumber.foreground': '#565f89',
      'editorLineNumber.activeForeground': '#c0caf5',
      'editorIndentGuide.background': '#292e42',
      'editorIndentGuide.activeBackground': '#414868',
      'editorWhitespace.foreground': '#292e42',
    },
  },
};

// Gruvbox Dark Theme
export const gruvboxDark: Theme = {
  id: 'gruvbox-dark',
  name: 'Gruvbox Dark',
  category: 'Retro',
  monaco: 'gruvbox-dark',
  colors: {
    bg: {
      primary: '#282828',
      secondary: '#1d2021',
      tertiary: '#504945',
      elevated: '#3c3836',
    },
    text: {
      primary: '#ebdbb2',
      secondary: '#d5c4a1',
      tertiary: '#928374',
      inverse: '#282828',
    },
    border: {
      primary: '#3c3836',
      secondary: '#504945',
      focus: '#83a598',
    },
    accent: {
      primary: '#83a598',
      secondary: '#8ec07c',
      hover: '#d3869b',
    },
    semantic: {
      error: '#fb4934',
      warning: '#fabd2f',
      success: '#b8bb26',
      info: '#83a598',
    },
    editor: {
      background: '#282828',
      foreground: '#ebdbb2',
      lineHighlight: '#3c3836',
      selection: '#504945',
      cursor: '#ebdbb2',
    },
  },
  monacoTheme: {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'comment', foreground: '928374', fontStyle: 'italic' },
      { token: 'keyword', foreground: 'fb4934' },
      { token: 'type', foreground: 'fabd2f' },
      { token: 'identifier', foreground: 'ebdbb2' },
      { token: 'number', foreground: 'd3869b' },
      { token: 'string', foreground: 'b8bb26' },
      { token: 'string.invalid', foreground: 'fb4934' },
    ],
    colors: {
      'editor.background': '#282828',
      'editor.foreground': '#ebdbb2',
      'editor.lineHighlightBackground': '#3c3836',
      'editor.selectionBackground': '#504945',
      'editorCursor.foreground': '#ebdbb2',
      'editorLineNumber.foreground': '#928374',
      'editorLineNumber.activeForeground': '#ebdbb2',
      'editorIndentGuide.background': '#3c3836',
      'editorIndentGuide.activeBackground': '#504945',
      'editorWhitespace.foreground': '#3c3836',
    },
  },
};

// Gruvbox Light Theme
export const gruvboxLight: Theme = {
  id: 'gruvbox-light',
  name: 'Gruvbox Light',
  category: 'Retro',
  monaco: 'gruvbox-light',
  colors: {
    bg: {
      primary: '#fbf1c7',
      secondary: '#f9f5d7',
      tertiary: '#d5c4a1',
      elevated: '#ebdbb2',
    },
    text: {
      primary: '#3c3836',
      secondary: '#504945',
      tertiary: '#928374',
      inverse: '#fbf1c7',
    },
    border: {
      primary: '#d5c4a1',
      secondary: '#bdae93',
      focus: '#076678',
    },
    accent: {
      primary: '#076678',
      secondary: '#427b58',
      hover: '#8f3f71',
    },
    semantic: {
      error: '#cc241d',
      warning: '#d79921',
      success: '#79740e',
      info: '#076678',
    },
    editor: {
      background: '#fbf1c7',
      foreground: '#3c3836',
      lineHighlight: '#ebdbb2',
      selection: '#d5c4a1',
      cursor: '#3c3836',
    },
  },
  monacoTheme: {
    base: 'vs',
    inherit: true,
    rules: [
      { token: 'comment', foreground: '928374', fontStyle: 'italic' },
      { token: 'keyword', foreground: '9d0006' },
      { token: 'type', foreground: 'b57614' },
      { token: 'identifier', foreground: '3c3836' },
      { token: 'number', foreground: '8f3f71' },
      { token: 'string', foreground: '79740e' },
      { token: 'string.invalid', foreground: 'cc241d' },
    ],
    colors: {
      'editor.background': '#fbf1c7',
      'editor.foreground': '#3c3836',
      'editor.lineHighlightBackground': '#ebdbb2',
      'editor.selectionBackground': '#d5c4a1',
      'editorCursor.foreground': '#3c3836',
      'editorLineNumber.foreground': '#928374',
      'editorLineNumber.activeForeground': '#3c3836',
      'editorIndentGuide.background': '#d5c4a1',
      'editorIndentGuide.activeBackground': '#bdae93',
      'editorWhitespace.foreground': '#d5c4a1',
    },
  },
};

// Catppuccin Mocha Theme
export const catppuccinMocha: Theme = {
  id: 'catppuccin-mocha',
  name: 'Catppuccin Mocha',
  category: 'Pastel & Cozy',
  monaco: 'catppuccin-mocha',
  colors: {
    bg: { primary: '#1e1e2e', secondary: '#181825', tertiary: '#313244', elevated: '#1e1e2e' },
    text: { primary: '#cdd6f4', secondary: '#bac2de', tertiary: '#6c7086', inverse: '#1e1e2e' },
    border: { primary: '#313244', secondary: '#45475a', focus: '#89b4fa' },
    accent: { primary: '#89b4fa', secondary: '#94e2d5', hover: '#cba6f7' },
    semantic: { error: '#f38ba8', warning: '#f9e2af', success: '#a6e3a1', info: '#89b4fa' },
    editor: { background: '#1e1e2e', foreground: '#cdd6f4', lineHighlight: '#313244', selection: '#45475a', cursor: '#f5e0dc' },
  },
  monacoTheme: {
    base: 'vs-dark', inherit: true,
    rules: [
      { token: 'comment', foreground: '6c7086', fontStyle: 'italic' },
      { token: 'keyword', foreground: 'cba6f7' },
      { token: 'type', foreground: 'f9e2af' },
      { token: 'identifier', foreground: 'cdd6f4' },
      { token: 'number', foreground: 'fab387' },
      { token: 'string', foreground: 'a6e3a1' },
    ],
    colors: {
      'editor.background': '#1e1e2e', 'editor.foreground': '#cdd6f4',
      'editor.lineHighlightBackground': '#313244', 'editor.selectionBackground': '#45475a',
      'editorCursor.foreground': '#f5e0dc', 'editorLineNumber.foreground': '#6c7086',
    },
  },
};

// Ayu Dark Theme
export const ayuDark: Theme = {
  id: 'ayu-dark',
  name: 'Ayu Dark',
  category: 'Popular Dark',
  monaco: 'ayu-dark',
  colors: {
    bg: { primary: '#0a0e14', secondary: '#01060e', tertiary: '#273747', elevated: '#11151c' },
    text: { primary: '#b3b1ad', secondary: '#8a8986', tertiary: '#4d5566', inverse: '#0a0e14' },
    border: { primary: '#0d1016', secondary: '#273747', focus: '#59c2ff' },
    accent: { primary: '#59c2ff', secondary: '#95e6cb', hover: '#ffae57' },
    semantic: { error: '#f07178', warning: '#ffb454', success: '#aad94c', info: '#59c2ff' },
    editor: { background: '#0a0e14', foreground: '#b3b1ad', lineHighlight: '#11151c', selection: '#273747', cursor: '#e6b450' },
  },
  monacoTheme: {
    base: 'vs-dark', inherit: true,
    rules: [
      { token: 'comment', foreground: '626a73', fontStyle: 'italic' },
      { token: 'keyword', foreground: 'ff8f40' },
      { token: 'type', foreground: 'ffb454' },
      { token: 'identifier', foreground: 'b3b1ad' },
      { token: 'number', foreground: 'ffae57' },
      { token: 'string', foreground: 'aad94c' },
    ],
    colors: {
      'editor.background': '#0a0e14', 'editor.foreground': '#b3b1ad',
      'editor.lineHighlightBackground': '#11151c', 'editor.selectionBackground': '#273747',
      'editorCursor.foreground': '#e6b450', 'editorLineNumber.foreground': '#4d5566',
    },
  },
};

// Material Palenight Theme
export const materialPalenight: Theme = {
  id: 'material-palenight',
  name: 'Material Palenight',
  category: 'Popular Dark',
  monaco: 'material-palenight',
  colors: {
    bg: { primary: '#292d3e', secondary: '#232635', tertiary: '#3a3f58', elevated: '#292d3e' },
    text: { primary: '#a6accd', secondary: '#959dcb', tertiary: '#676e95', inverse: '#292d3e' },
    border: { primary: '#3a3f58', secondary: '#676e95', focus: '#82aaff' },
    accent: { primary: '#82aaff', secondary: '#89ddff', hover: '#c792ea' },
    semantic: { error: '#ff5370', warning: '#ffcb6b', success: '#c3e88d', info: '#82aaff' },
    editor: { background: '#292d3e', foreground: '#a6accd', lineHighlight: '#3a3f58', selection: '#676e9533', cursor: '#ffcc00' },
  },
  monacoTheme: {
    base: 'vs-dark', inherit: true,
    rules: [
      { token: 'comment', foreground: '676e95', fontStyle: 'italic' },
      { token: 'keyword', foreground: 'c792ea' },
      { token: 'type', foreground: 'ffcb6b' },
      { token: 'identifier', foreground: 'a6accd' },
      { token: 'number', foreground: 'f78c6c' },
      { token: 'string', foreground: 'c3e88d' },
    ],
    colors: {
      'editor.background': '#292d3e', 'editor.foreground': '#a6accd',
      'editor.lineHighlightBackground': '#3a3f58', 'editor.selectionBackground': '#676e9533',
      'editorCursor.foreground': '#ffcc00', 'editorLineNumber.foreground': '#676e95',
    },
  },
};

// Night Owl Theme
export const nightOwl: Theme = {
  id: 'night-owl',
  name: 'Night Owl',
  category: 'Popular Dark',
  monaco: 'night-owl',
  colors: {
    bg: { primary: '#011627', secondary: '#01111d', tertiary: '#0b2942', elevated: '#011627' },
    text: { primary: '#d6deeb', secondary: '#c5e4fd', tertiary: '#5f7e97', inverse: '#011627' },
    border: { primary: '#0b2942', secondary: '#5f7e97', focus: '#82aaff' },
    accent: { primary: '#82aaff', secondary: '#7fdbca', hover: '#c792ea' },
    semantic: { error: '#ef5350', warning: '#ffeb95', success: '#addb67', info: '#82aaff' },
    editor: { background: '#011627', foreground: '#d6deeb', lineHighlight: '#01111d', selection: '#1d3b53', cursor: '#80a4c2' },
  },
  monacoTheme: {
    base: 'vs-dark', inherit: true,
    rules: [
      { token: 'comment', foreground: '637777', fontStyle: 'italic' },
      { token: 'keyword', foreground: 'c792ea' },
      { token: 'type', foreground: 'ffcb8b' },
      { token: 'identifier', foreground: 'd6deeb' },
      { token: 'number', foreground: 'f78c6c' },
      { token: 'string', foreground: 'ecc48d' },
    ],
    colors: {
      'editor.background': '#011627', 'editor.foreground': '#d6deeb',
      'editor.lineHighlightBackground': '#01111d', 'editor.selectionBackground': '#1d3b53',
      'editorCursor.foreground': '#80a4c2', 'editorLineNumber.foreground': '#4b6479',
    },
  },
};

// Synthwave '84 Theme
export const synthwave: Theme = {
  id: 'synthwave-84',
  name: 'Synthwave \'84',
  category: 'Vibrant & Fun',
  monaco: 'synthwave-84',
  colors: {
    bg: { primary: '#262335', secondary: '#1e1c2a', tertiary: '#463465', elevated: '#262335' },
    text: { primary: '#dfd9e2', secondary: '#e4dfe7', tertiary: '#796686', inverse: '#262335' },
    border: { primary: '#463465', secondary: '#796686', focus: '#f97e72' },
    accent: { primary: '#f97e72', secondary: '#72f1b8', hover: '#fede5d' },
    semantic: { error: '#fe4450', warning: '#fede5d', success: '#72f1b8', info: '#36f9f6' },
    editor: { background: '#262335', foreground: '#dfd9e2', lineHighlight: '#2a2139', selection: '#463465', cursor: '#fede5d' },
  },
  monacoTheme: {
    base: 'vs-dark', inherit: true,
    rules: [
      { token: 'comment', foreground: '796686', fontStyle: 'italic' },
      { token: 'keyword', foreground: 'ff7edb' },
      { token: 'type', foreground: 'fede5d' },
      { token: 'identifier', foreground: 'dfd9e2' },
      { token: 'number', foreground: 'f97e72' },
      { token: 'string', foreground: '72f1b8' },
    ],
    colors: {
      'editor.background': '#262335', 'editor.foreground': '#dfd9e2',
      'editor.lineHighlightBackground': '#2a2139', 'editor.selectionBackground': '#463465',
      'editorCursor.foreground': '#fede5d', 'editorLineNumber.foreground': '#796686',
    },
  },
};

// Rose Pine Theme
export const rosePine: Theme = {
  id: 'rose-pine',
  name: 'Rosé Pine',
  category: 'Pastel & Cozy',
  monaco: 'rose-pine',
  colors: {
    bg: { primary: '#191724', secondary: '#1f1d2e', tertiary: '#403d52', elevated: '#191724' },
    text: { primary: '#e0def4', secondary: '#908caa', tertiary: '#6e6a86', inverse: '#191724' },
    border: { primary: '#26233a', secondary: '#403d52', focus: '#9ccfd8' },
    accent: { primary: '#9ccfd8', secondary: '#31748f', hover: '#ebbcba' },
    semantic: { error: '#eb6f92', warning: '#f6c177', success: '#9ccfd8', info: '#31748f' },
    editor: { background: '#191724', foreground: '#e0def4', lineHighlight: '#1f1d2e', selection: '#403d52', cursor: '#524f67' },
  },
  monacoTheme: {
    base: 'vs-dark', inherit: true,
    rules: [
      { token: 'comment', foreground: '6e6a86', fontStyle: 'italic' },
      { token: 'keyword', foreground: '31748f' },
      { token: 'type', foreground: 'f6c177' },
      { token: 'identifier', foreground: 'e0def4' },
      { token: 'number', foreground: 'ebbcba' },
      { token: 'string', foreground: '9ccfd8' },
    ],
    colors: {
      'editor.background': '#191724', 'editor.foreground': '#e0def4',
      'editor.lineHighlightBackground': '#1f1d2e', 'editor.selectionBackground': '#403d52',
      'editorCursor.foreground': '#524f67', 'editorLineNumber.foreground': '#6e6a86',
    },
  },
};

// Everforest Dark Theme
export const everforestDark: Theme = {
  id: 'everforest-dark',
  name: 'Everforest Dark',
  category: 'Nature Inspired',
  monaco: 'everforest-dark',
  colors: {
    bg: { primary: '#2b3339', secondary: '#232a2e', tertiary: '#3d484d', elevated: '#2b3339' },
    text: { primary: '#d3c6aa', secondary: '#a7c080', tertiary: '#7a8478', inverse: '#2b3339' },
    border: { primary: '#3d484d', secondary: '#7a8478', focus: '#a7c080' },
    accent: { primary: '#a7c080', secondary: '#83c092', hover: '#dbbc7f' },
    semantic: { error: '#e67e80', warning: '#dbbc7f', success: '#a7c080', info: '#7fbbb3' },
    editor: { background: '#2b3339', foreground: '#d3c6aa', lineHighlight: '#323c41', selection: '#3d484d', cursor: '#d3c6aa' },
  },
  monacoTheme: {
    base: 'vs-dark', inherit: true,
    rules: [
      { token: 'comment', foreground: '7a8478', fontStyle: 'italic' },
      { token: 'keyword', foreground: 'e67e80' },
      { token: 'type', foreground: 'dbbc7f' },
      { token: 'identifier', foreground: 'd3c6aa' },
      { token: 'number', foreground: 'd699b6' },
      { token: 'string', foreground: 'a7c080' },
    ],
    colors: {
      'editor.background': '#2b3339', 'editor.foreground': '#d3c6aa',
      'editor.lineHighlightBackground': '#323c41', 'editor.selectionBackground': '#3d484d',
      'editorCursor.foreground': '#d3c6aa', 'editorLineNumber.foreground': '#7a8478',
    },
  },
};

// Atom One Light Theme
export const atomOneLight: Theme = {
  id: 'atom-one-light',
  name: 'Atom One Light',
  category: 'Popular Light',
  monaco: 'atom-one-light',
  colors: {
    bg: { primary: '#fafafa', secondary: '#f0f0f0', tertiary: '#d7dae0', elevated: '#fafafa' },
    text: { primary: '#383a42', secondary: '#696c77', tertiary: '#a0a1a7', inverse: '#fafafa' },
    border: { primary: '#e5e5e6', secondary: '#d7dae0', focus: '#4078f2' },
    accent: { primary: '#4078f2', secondary: '#0184bc', hover: '#a626a4' },
    semantic: { error: '#e45649', warning: '#986801', success: '#50a14f', info: '#4078f2' },
    editor: { background: '#fafafa', foreground: '#383a42', lineHighlight: '#f0f0f0', selection: '#e5e5e6', cursor: '#383a42' },
  },
  monacoTheme: {
    base: 'vs', inherit: true,
    rules: [
      { token: 'comment', foreground: 'a0a1a7', fontStyle: 'italic' },
      { token: 'keyword', foreground: 'a626a4' },
      { token: 'type', foreground: 'c18401' },
      { token: 'identifier', foreground: '383a42' },
      { token: 'number', foreground: '986801' },
      { token: 'string', foreground: '50a14f' },
    ],
    colors: {
      'editor.background': '#fafafa', 'editor.foreground': '#383a42',
      'editor.lineHighlightBackground': '#f0f0f0', 'editor.selectionBackground': '#e5e5e6',
      'editorCursor.foreground': '#383a42', 'editorLineNumber.foreground': '#a0a1a7',
    },
  },
};

// Shades of Purple Theme
export const shadesOfPurple: Theme = {
  id: 'shades-of-purple',
  name: 'Shades of Purple',
  category: 'Vibrant & Fun',
  monaco: 'shades-of-purple',
  colors: {
    bg: { primary: '#2d2b55', secondary: '#1e1e3f', tertiary: '#4d21fc', elevated: '#2d2b55' },
    text: { primary: '#e3dfff', secondary: '#b362ff', tertiary: '#6943ff', inverse: '#2d2b55' },
    border: { primary: '#4d21fc', secondary: '#6943ff', focus: '#fad000' },
    accent: { primary: '#fad000', secondary: '#ff628c', hover: '#a599e9' },
    semantic: { error: '#ec3a37', warning: '#fad000', success: '#3ad900', info: '#00d8ff' },
    editor: { background: '#2d2b55', foreground: '#e3dfff', lineHighlight: '#1e1e3f', selection: '#4d21fc', cursor: '#fad000' },
  },
  monacoTheme: {
    base: 'vs-dark', inherit: true,
    rules: [
      { token: 'comment', foreground: '9c9c9c', fontStyle: 'italic' },
      { token: 'keyword', foreground: 'ff9d00' },
      { token: 'type', foreground: 'fad000' },
      { token: 'identifier', foreground: 'e3dfff' },
      { token: 'number', foreground: 'ff628c' },
      { token: 'string', foreground: 'a5ff90' },
    ],
    colors: {
      'editor.background': '#2d2b55', 'editor.foreground': '#e3dfff',
      'editor.lineHighlightBackground': '#1e1e3f', 'editor.selectionBackground': '#4d21fc',
      'editorCursor.foreground': '#fad000', 'editorLineNumber.foreground': '#6943ff',
    },
  },
};

// Cobalt2 Theme
export const cobalt2: Theme = {
  id: 'cobalt2',
  name: 'Cobalt2',
  category: 'Vibrant & Fun',
  monaco: 'cobalt2',
  colors: {
    bg: { primary: '#193549', secondary: '#0d3a58', tertiary: '#1f4662', elevated: '#193549' },
    text: { primary: '#ffffff', secondary: '#cdd3de', tertiary: '#adb7c2', inverse: '#193549' },
    border: { primary: '#1f4662', secondary: '#0d3a58', focus: '#ffc600' },
    accent: { primary: '#ffc600', secondary: '#0088ff', hover: '#ff9d00' },
    semantic: { error: '#ff0000', warning: '#ffc600', success: '#3ad900', info: '#0088ff' },
    editor: { background: '#193549', foreground: '#ffffff', lineHighlight: '#1f4662', selection: '#0d3a58', cursor: '#ffc600' },
  },
  monacoTheme: {
    base: 'vs-dark', inherit: true,
    rules: [
      { token: 'comment', foreground: '0088ff', fontStyle: 'italic' },
      { token: 'keyword', foreground: 'ff9d00' },
      { token: 'type', foreground: 'ffc600' },
      { token: 'identifier', foreground: 'ffffff' },
      { token: 'number', foreground: 'ff628c' },
      { token: 'string', foreground: '3ad900' },
    ],
    colors: {
      'editor.background': '#193549', 'editor.foreground': '#ffffff',
      'editor.lineHighlightBackground': '#1f4662', 'editor.selectionBackground': '#0d3a58',
      'editorCursor.foreground': '#ffc600', 'editorLineNumber.foreground': '#adb7c2',
    },
  },
};

// Horizon Theme
export const horizon: Theme = {
  id: 'horizon',
  name: 'Horizon',
  category: 'Vibrant & Fun',
  monaco: 'horizon',
  colors: {
    bg: { primary: '#1c1e26', secondary: '#16161c', tertiary: '#2e303e', elevated: '#1c1e26' },
    text: { primary: '#e0e0e0', secondary: '#d5d8da', tertiary: '#6c6f93', inverse: '#1c1e26' },
    border: { primary: '#2e303e', secondary: '#6c6f93', focus: '#e95678' },
    accent: { primary: '#e95678', secondary: '#fab795', hover: '#f09383' },
    semantic: { error: '#e95678', warning: '#fab795', success: '#29d398', info: '#26bbd9' },
    editor: { background: '#1c1e26', foreground: '#e0e0e0', lineHighlight: '#2e303e', selection: '#6c6f93', cursor: '#f09383' },
  },
  monacoTheme: {
    base: 'vs-dark', inherit: true,
    rules: [
      { token: 'comment', foreground: '6c6f93', fontStyle: 'italic' },
      { token: 'keyword', foreground: 'b877db' },
      { token: 'type', foreground: 'fab795' },
      { token: 'identifier', foreground: 'e0e0e0' },
      { token: 'number', foreground: 'f09383' },
      { token: 'string', foreground: 'fadad1' },
    ],
    colors: {
      'editor.background': '#1c1e26', 'editor.foreground': '#e0e0e0',
      'editor.lineHighlightBackground': '#2e303e', 'editor.selectionBackground': '#6c6f93',
      'editorCursor.foreground': '#f09383', 'editorLineNumber.foreground': '#6c6f93',
    },
  },
};

// Theme registry
export const themes: Record<string, Theme> = {
  'solarized-dark': solarizedDark,
  'solarized-light': solarizedLight,
  'monokai': monokai,
  'dracula': dracula,
  'one-dark-pro': oneDarkPro,
  'github-dark': githubDark,
  'github-light': githubLight,
  'nord': nord,
  'tokyo-night': tokyoNight,
  'gruvbox-dark': gruvboxDark,
  'gruvbox-light': gruvboxLight,
  'catppuccin-mocha': catppuccinMocha,
  'ayu-dark': ayuDark,
  'material-palenight': materialPalenight,
  'night-owl': nightOwl,
  'synthwave-84': synthwave,
  'rose-pine': rosePine,
  'everforest-dark': everforestDark,
  'atom-one-light': atomOneLight,
  'shades-of-purple': shadesOfPurple,
  'cobalt2': cobalt2,
  'horizon': horizon,
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
 * Get list of available themes grouped by category
 */
export function getAvailableThemes(): Array<{ category: string; themes: Array<{ id: string; name: string }> }> {
  const themesByCategory = Object.values(themes).reduce((acc, theme) => {
    if (!acc[theme.category]) {
      acc[theme.category] = [];
    }
    acc[theme.category].push({ id: theme.id, name: theme.name });
    return acc;
  }, {} as Record<string, Array<{ id: string; name: string }>>);

  // Define category order
  const categoryOrder = [
    'Classic',
    'Popular Dark',
    'Popular Light',
    'Pastel & Cozy',
    'Vibrant & Fun',
    'Nature Inspired',
    'Retro',
  ];

  return categoryOrder
    .filter(cat => themesByCategory[cat])
    .map(category => ({
      category,
      themes: themesByCategory[category],
    }));
}
