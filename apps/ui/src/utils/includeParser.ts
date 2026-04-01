/**
 * Parse `include <…>`, `use <…>`, and `import("…")` statements from OpenSCAD
 * source code.
 *
 * Handles:
 * - Stripping single-line comments (//)
 * - Stripping block comments
 * - Ignoring string literals ("…") for include/use parsing
 * - Both `include` and `use` directives (angle-bracket paths)
 * - `import("path")` function calls (quoted string paths)
 */

export interface IncludeDirective {
  /** 'include' or 'use' */
  type: 'include' | 'use';
  /** The path exactly as written between angle brackets */
  path: string;
}

export interface ImportDirective {
  /** Always 'import' */
  type: 'import';
  /** The path exactly as written in the quoted string */
  path: string;
}

/**
 * Strip only comments from OpenSCAD code, preserving string literals.
 * Used by `parseImports()` since import paths live inside strings.
 */
export function stripComments(code: string): string {
  const result: string[] = [];
  let i = 0;
  let inString = false;

  while (i < code.length) {
    if (inString) {
      if (code[i] === '\\' && i + 1 < code.length) {
        result.push(code[i], code[i + 1]);
        i += 2;
        continue;
      }
      if (code[i] === '"') {
        inString = false;
      }
      result.push(code[i]);
      i++;
      continue;
    }

    // Single-line comment
    if (code[i] === '/' && code[i + 1] === '/') {
      while (i < code.length && code[i] !== '\n') {
        result.push(' ');
        i++;
      }
      continue;
    }

    // Block comment
    if (code[i] === '/' && code[i + 1] === '*') {
      result.push(' ', ' ');
      i += 2;
      while (i < code.length) {
        if (code[i] === '*' && code[i + 1] === '/') {
          result.push(' ', ' ');
          i += 2;
          break;
        }
        result.push(code[i] === '\n' ? '\n' : ' ');
        i++;
      }
      continue;
    }

    if (code[i] === '"') {
      inString = true;
    }
    result.push(code[i]);
    i++;
  }

  return result.join('');
}

/**
 * Strip comments and string literals from OpenSCAD code,
 * replacing them with whitespace to preserve line/column structure.
 */
export function stripCommentsAndStrings(code: string): string {
  const result: string[] = [];
  let i = 0;

  while (i < code.length) {
    // Single-line comment
    if (code[i] === '/' && code[i + 1] === '/') {
      // Skip until end of line
      while (i < code.length && code[i] !== '\n') {
        result.push(' ');
        i++;
      }
      continue;
    }

    // Block comment
    if (code[i] === '/' && code[i + 1] === '*') {
      result.push(' ');
      result.push(' ');
      i += 2;
      while (i < code.length) {
        if (code[i] === '*' && code[i + 1] === '/') {
          result.push(' ');
          result.push(' ');
          i += 2;
          break;
        }
        // Preserve newlines for line structure
        result.push(code[i] === '\n' ? '\n' : ' ');
        i++;
      }
      continue;
    }

    // String literal
    if (code[i] === '"') {
      result.push(' ');
      i++;
      while (i < code.length && code[i] !== '"') {
        if (code[i] === '\\' && i + 1 < code.length) {
          result.push(' ');
          result.push(' ');
          i += 2;
          continue;
        }
        result.push(code[i] === '\n' ? '\n' : ' ');
        i++;
      }
      if (i < code.length) {
        result.push(' '); // closing quote
        i++;
      }
      continue;
    }

    result.push(code[i]);
    i++;
  }

  return result.join('');
}

/**
 * Extract all `include <path>` and `use <path>` directives from OpenSCAD code.
 * Comments and string literals are stripped first to avoid false positives.
 */
export function parseIncludes(code: string): IncludeDirective[] {
  const stripped = stripCommentsAndStrings(code);
  const directives: IncludeDirective[] = [];

  // Match: include <path> or use <path>
  // OpenSCAD requires angle brackets for include/use (not quotes)
  const regex = /\b(include|use)\s*<\s*([^>]+?)\s*>/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(stripped)) !== null) {
    const type = match[1] as 'include' | 'use';
    const path = match[2].trim();
    if (path) {
      directives.push({ type, path });
    }
  }

  return directives;
}

/**
 * Extract all `import("path")` calls from OpenSCAD code.
 * Only comments are stripped (not strings) since the paths live inside strings.
 */
export function parseImports(code: string): ImportDirective[] {
  const stripped = stripComments(code);
  const directives: ImportDirective[] = [];

  // Match: import("path") or import("path", ...)
  // OpenSCAD import() uses quoted strings for the file path.
  const regex = /\bimport\s*\(\s*"([^"]+)"\s*[,)]/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(stripped)) !== null) {
    const path = match[1].trim();
    if (path) {
      directives.push({ type: 'import', path });
    }
  }

  return directives;
}
