/**
 * OpenSCAD Code Formatter
 *
 * Tree-sitter based formatter for OpenSCAD code
 */

import { initParser, parse } from './parser';
import { printTree } from './printer';

export interface FormatOptions {
  indentSize?: number;
  useTabs?: boolean;
  printWidth?: number;
}

const DEFAULT_OPTIONS: Required<FormatOptions> = {
  indentSize: 4,
  useTabs: false,
  printWidth: 80,
};

let isInitialized = false;

/**
 * Initialize the formatter (must be called once before formatting)
 */
export async function initFormatter(): Promise<void> {
  if (isInitialized) {
    return;
  }

  await initParser();
  isInitialized = true;
}

/**
 * Format OpenSCAD code
 */
export async function formatOpenScadCode(
  code: string,
  options: FormatOptions = {}
): Promise<string> {
  // Ensure formatter is initialized
  if (!isInitialized) {
    await initFormatter();
  }

  // Parse the code
  const tree = parse(code);
  if (!tree) {
    console.warn('[OpenSCAD Formatter] Failed to parse code, returning original');
    return code;
  }

  try {
    // Merge options with defaults
    const opts = { ...DEFAULT_OPTIONS, ...options };

    // Print the formatted code
    const formatted = printTree(tree, opts);

    return formatted;
  } catch (error) {
    console.error('[OpenSCAD Formatter] Formatting error:', error);
    return code; // Return original code on error
  } finally {
    // Clean up the tree
    tree.delete();
  }
}

// Re-export types and utilities
export { initParser, parse } from './parser';
export type { Parser } from 'web-tree-sitter';
