/**
 * Vim Configuration Parser
 *
 * This file parses user-provided vim configuration and applies it to Monaco editor.
 * Supports vim-style commands for keybindings and custom commands.
 */

import { Vim } from 'monaco-vim';

/**
 * Parse and apply vim configuration from a string
 * @param configString - User-provided vim configuration
 * @returns Array of errors encountered during parsing (empty if successful)
 */
export function applyVimConfig(configString: string): string[] {
  const errors: string[] = [];
  const lines = configString.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const lineNum = i + 1;

    // Skip empty lines and comments
    if (!line || line.startsWith('#')) {
      continue;
    }

    try {
      // Parse and apply the vim command
      parseVimCommand(line);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      errors.push(`Line ${lineNum}: ${errorMsg}`);
      console.warn(`[VimConfig] Error on line ${lineNum}: ${errorMsg}`);
    }
  }

  return errors;
}

/**
 * Parse a single vim command and execute it
 */
function parseVimCommand(command: string): void {
  const tokens = tokenize(command);

  if (tokens.length === 0) {
    return;
  }

  const cmdType = tokens[0].toLowerCase();

  switch (cmdType) {
    case 'map':
    case 'imap':
    case 'nmap':
    case 'vmap':
      parseMapCommand(tokens, cmdType);
      break;

    case 'noremap':
    case 'inoremap':
    case 'nnoremap':
    case 'vnoremap': {
      // For now, treat noremap the same as map
      // monaco-vim doesn't distinguish between recursive and non-recursive maps
      const baseCmd = cmdType.replace('nore', '') as 'map' | 'imap' | 'nmap' | 'vmap';
      parseMapCommand(tokens, baseCmd);
      break;
    }

    default:
      throw new Error(`Unknown command: ${cmdType}`);
  }
}

/**
 * Parse a map command (e.g., "map kj <Esc> insert")
 */
function parseMapCommand(tokens: string[], cmdType: string): void {
  if (tokens.length < 3) {
    throw new Error(
      `Invalid ${cmdType} command: requires at least 3 arguments (${cmdType} <from> <to> [mode])`
    );
  }

  const from = tokens[1];
  const to = tokens[2];

  // Determine mode from command type or explicit mode argument
  let mode: string;

  if (cmdType === 'imap') {
    mode = 'insert';
  } else if (cmdType === 'nmap') {
    mode = 'normal';
  } else if (cmdType === 'vmap') {
    mode = 'visual';
  } else {
    // Generic 'map' command - mode can be specified as 4th argument
    mode = tokens[3] || 'normal'; // Default to normal mode
  }

  // Apply the mapping
  try {
    Vim.map(from, to, mode);
  } catch (error) {
    throw new Error(`Failed to map ${from} → ${to} in ${mode} mode: ${error}`);
  }
}

/**
 * Tokenize a command line, respecting special keys like <Esc>, <CR>, etc.
 */
function tokenize(line: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let inSpecialKey = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '<') {
      if (current.trim()) {
        tokens.push(current.trim());
        current = '';
      }
      inSpecialKey = true;
      current = '<';
    } else if (char === '>' && inSpecialKey) {
      current += '>';
      tokens.push(current);
      current = '';
      inSpecialKey = false;
    } else if (char === ' ' && !inSpecialKey) {
      if (current.trim()) {
        tokens.push(current.trim());
        current = '';
      }
    } else {
      current += char;
    }
  }

  if (current.trim()) {
    tokens.push(current.trim());
  }

  return tokens;
}

/**
 * Available modes for keybindings:
 * - 'insert': Insert mode
 * - 'normal': Normal mode
 * - 'visual': Visual mode
 * - 'replace': Replace mode
 *
 * Special keys:
 * - <Esc>: Escape key
 * - <CR>: Enter/Return
 * - <Space>: Space bar
 * - <C-x>: Ctrl+x
 * - <S-x>: Shift+x
 * - <A-x> or <M-x>: Alt+x
 * - <leader>: Leader key (default: \)
 *
 * Supported commands:
 * - map <from> <to> [mode]: Map key sequence (default mode: normal)
 * - imap <from> <to>: Map in insert mode
 * - nmap <from> <to>: Map in normal mode
 * - vmap <from> <to>: Map in visual mode
 * - noremap/inoremap/nnoremap/vnoremap: Non-recursive maps (treated same as map)
 *
 * Examples:
 *   map kj <Esc> insert
 *   imap jk <Esc>
 *   nmap <Space>w :w<CR>
 *   vmap < <gv
 */
