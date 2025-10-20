/**
 * Tree-sitter OpenSCAD Parser Wrapper
 *
 * Initializes and provides access to the tree-sitter OpenSCAD parser
 */

import * as TreeSitter from 'web-tree-sitter';

let parser: TreeSitter.Parser | null = null;
let language: TreeSitter.Language | null = null;
let initPromise: Promise<void> | null = null;

/**
 * Initialize the parser (call once at startup)
 */
export async function initParser(): Promise<void> {
  if (initPromise) {
    return initPromise;
  }

  initPromise = (async () => {
    try {
      // Detect if we're running in Node.js or browser
      // @ts-expect-error - process is a Node.js global that may not be defined in browser
      const isNode = typeof process !== 'undefined' && process.versions?.node;

      if (isNode) {
        // Node.js environment (tests)
        // @ts-expect-error - path is a Node.js module
        const path = await import('path');

        // Initialize web-tree-sitter for Node
        await TreeSitter.Parser.init();

        // Load WASM from public directory in project root
        // @ts-expect-error - process.cwd() is Node.js only
        const wasmPath = path.resolve(process.cwd(), 'public/tree-sitter-openscad.wasm');
        language = await TreeSitter.Language.load(wasmPath);
      } else {
        // Browser environment
        await TreeSitter.Parser.init({
          locateFile(scriptName: string) {
            // Return the public path for WASM files
            return `/${scriptName}`;
          },
        });

        // Load the OpenSCAD language grammar
        language = await TreeSitter.Language.load('/tree-sitter-openscad.wasm');
      }

      // Create parser instance
      parser = new TreeSitter.Parser();
      parser.setLanguage(language);

      console.log('[OpenSCAD Formatter] Parser initialized successfully');
    } catch (error) {
      console.error('[OpenSCAD Formatter] Failed to initialize parser:', error);
      throw error;
    }
  })();

  return initPromise;
}

/**
 * Parse OpenSCAD code and return the syntax tree
 */
export function parse(code: string): TreeSitter.Tree | null {
  if (!parser) {
    console.error('[OpenSCAD Formatter] Parser not initialized. Call initParser() first.');
    return null;
  }

  try {
    return parser.parse(code);
  } catch (error) {
    console.error('[OpenSCAD Formatter] Parse error:', error);
    return null;
  }
}

/**
 * Get the parser instance (after initialization)
 */
export function getParser(): TreeSitter.Parser | null {
  return parser;
}

/**
 * Get the language instance (after initialization)
 */
export function getLanguage(): TreeSitter.Language | null {
  return language;
}
