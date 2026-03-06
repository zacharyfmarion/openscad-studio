/**
 * Parse `include <…>` and `use <…>` statements from OpenSCAD source code.
 *
 * Handles:
 * - Stripping single-line comments (//)
 * - Stripping block comments
 * - Ignoring string literals ("…")
 * - Both `include` and `use` directives
 * - Angle-bracket paths: include <path/to/file.scad>
 */

export interface IncludeDirective {
  /** 'include' or 'use' */
  type: 'include' | 'use';
  /** The path exactly as written between angle brackets */
  path: string;
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
