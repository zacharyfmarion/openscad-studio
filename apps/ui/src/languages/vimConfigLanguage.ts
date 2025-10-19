/**
 * Vim Configuration Language Definition for Monaco Editor
 *
 * Provides syntax highlighting for vim configuration commands
 */

import type * as Monaco from 'monaco-editor';

export function registerVimConfigLanguage(monaco: typeof Monaco) {
  // Register the language
  monaco.languages.register({ id: 'vimconfig' });

  // Define the tokenizer
  monaco.languages.setMonarchTokensProvider('vimconfig', {
    defaultToken: '',
    tokenPostfix: '.vim',

    keywords: [
      'map', 'nmap', 'vmap', 'imap', 'smap', 'xmap', 'omap', 'cmap', 'tmap',
      'noremap', 'nnoremap', 'vnoremap', 'inoremap', 'snoremap', 'xnoremap', 'onoremap', 'cnoremap', 'tnoremap',
      'unmap', 'nunmap', 'vunmap', 'iunmap', 'sunmap', 'xunmap', 'ounmap', 'cunmap', 'tunmap',
      'mapclear', 'nmapclear', 'vmapclear', 'imapclear', 'smapclear', 'xmapclear', 'omapclear', 'cmapclear', 'tmapclear',
    ],

    modes: [
      'normal', 'insert', 'visual', 'replace', 'command', 'terminal',
    ],

    // Special keys that appear in angle brackets
    specialKeys: [
      'Esc', 'CR', 'Enter', 'Return', 'Space', 'Tab', 'BS', 'Backspace',
      'Del', 'Delete', 'Up', 'Down', 'Left', 'Right',
      'Home', 'End', 'PageUp', 'PageDown', 'Insert',
      'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12',
      'leader', 'Leader',
    ],

    // Control/modifier prefixes
    modifiers: [
      'C-', 'Ctrl-', 'Control-',
      'S-', 'Shift-',
      'A-', 'Alt-', 'M-', 'Meta-',
      'D-', 'Cmd-', 'Command-',
    ],

    tokenizer: {
      root: [
        // Comments
        [/#.*$/, 'comment'],

        // Commands (map, imap, etc.)
        [/\b(map|nmap|vmap|imap|smap|xmap|omap|cmap|tmap|noremap|nnoremap|vnoremap|inoremap|snoremap|xnoremap|onoremap|cnoremap|tnoremap|unmap|nunmap|vunmap|iunmap|sunmap|xunmap|ounmap|cunmap|tunmap|mapclear|nmapclear|vmapclear|imapclear|smapclear|xmapclear|omapclear|cmapclear|tmapclear)\b/, 'keyword'],

        // Modes
        [/\b(normal|insert|visual|replace|command|terminal)\b/, 'type'],

        // Special keys in angle brackets
        [/<[A-Za-z0-9\-]+>/, {
          cases: {
            '<leader>': 'variable.special',
            '<Leader>': 'variable.special',
            '@default': 'string.special',
          }
        }],

        // Strings (for key sequences without angle brackets)
        [/[a-zA-Z][a-zA-Z0-9]*/, 'variable'],

        // Whitespace
        [/[ \t\r\n]+/, ''],
      ],
    },
  });

  // Define the theme colors for vim config
  monaco.editor.defineTheme('vim-config-theme', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'comment', foreground: '6A9955', fontStyle: 'italic' },
      { token: 'keyword', foreground: 'C586C0', fontStyle: 'bold' },
      { token: 'type', foreground: '4EC9B0' },
      { token: 'string.special', foreground: 'CE9178' },
      { token: 'variable.special', foreground: 'DCDCAA', fontStyle: 'bold' },
      { token: 'variable', foreground: '9CDCFE' },
    ],
    colors: {},
  });

  // Configure language features
  monaco.languages.setLanguageConfiguration('vimconfig', {
    comments: {
      lineComment: '#',
    },
    brackets: [
      ['<', '>'],
    ],
    autoClosingPairs: [
      { open: '<', close: '>' },
    ],
    surroundingPairs: [
      { open: '<', close: '>' },
    ],
  });
}
