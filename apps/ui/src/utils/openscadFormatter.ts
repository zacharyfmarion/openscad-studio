/**
 * OpenSCAD Code Formatter
 *
 * Provides basic formatting for OpenSCAD code:
 * - Consistent indentation
 * - Spacing around operators
 * - Bracket alignment
 * - Removes trailing whitespace
 * - Removes excessive blank lines
 */

export interface FormatOptions {
  indentSize?: number;
  useTabs?: boolean;
}

const DEFAULT_OPTIONS: Required<FormatOptions> = {
  indentSize: 4,
  useTabs: false,
};

export function formatOpenScadCode(code: string, options: FormatOptions = {}): string {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const indentStr = opts.useTabs ? '\t' : ' '.repeat(opts.indentSize);

  // Split into lines and remove trailing whitespace
  const lines = code.split('\n').map(line => line.trimEnd());

  let formatted: string[] = [];
  let indentLevel = 0;
  let lastLineWasBlank = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Skip multiple consecutive blank lines
    if (trimmed === '') {
      if (!lastLineWasBlank) {
        formatted.push('');
        lastLineWasBlank = true;
      }
      continue;
    }

    lastLineWasBlank = false;

    // Count opening and closing braces to determine indent
    let openBraces = 0;
    let closeBraces = 0;
    let inString = false;
    let inLineComment = false;
    let inBlockComment = false;

    // First pass: count braces (ignore those in strings/comments)
    for (let j = 0; j < trimmed.length; j++) {
      const char = trimmed[j];
      const nextChar = trimmed[j + 1];
      const prevChar = trimmed[j - 1];

      // String handling
      if (char === '"' && prevChar !== '\\') {
        inString = !inString;
        continue;
      }
      if (inString) continue;

      // Line comment
      if (char === '/' && nextChar === '/' && !inBlockComment) {
        inLineComment = true;
        break; // Rest of line is comment
      }

      // Block comment
      if (char === '/' && nextChar === '*' && !inLineComment) {
        inBlockComment = true;
        j++; // Skip next char
        continue;
      }
      if (char === '*' && nextChar === '/' && inBlockComment) {
        inBlockComment = false;
        j++; // Skip next char
        continue;
      }
      if (inBlockComment) continue;

      // Count braces
      if (char === '{') openBraces++;
      if (char === '}') closeBraces++;
    }

    // Determine indent for this line
    // If line starts with }, decrease indent before
    let lineIndent = indentLevel;
    if (trimmed.startsWith('}')) {
      lineIndent = Math.max(0, indentLevel - 1);
    }

    // Format the line content (add spacing, etc.)
    const formattedContent = formatLineContent(trimmed);

    // Add the formatted line with proper indentation
    formatted.push(indentStr.repeat(lineIndent) + formattedContent);

    // Update indent level for next line
    // Closing braces decrease level
    indentLevel = Math.max(0, indentLevel - closeBraces);
    // Opening braces increase level
    indentLevel += openBraces;
  }

  // Remove trailing blank lines and ensure single newline at end
  while (formatted.length > 0 && formatted[formatted.length - 1].trim() === '') {
    formatted.pop();
  }

  return formatted.join('\n') + '\n';
}

/**
 * Format the content of a single line (spacing around operators, etc.)
 */
function formatLineContent(line: string): string {
  let result = '';
  let inString = false;
  let inComment = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];
    const prevChar = line[i - 1];
    const prevResultChar = result[result.length - 1];

    // Handle strings
    if (char === '"' && prevChar !== '\\') {
      inString = !inString;
      result += char;
      continue;
    }
    if (inString) {
      result += char;
      continue;
    }

    // Handle comments
    if (char === '/' && (nextChar === '/' || nextChar === '*')) {
      inComment = true;
      result += char;
      continue;
    }
    if (inComment) {
      result += char;
      continue;
    }

    // Add space after commas
    if (char === ',') {
      result += char;
      if (nextChar && nextChar !== ' ' && nextChar !== '\n') {
        result += ' ';
      }
      continue;
    }

    // Add space around binary operators
    const isBinaryOp = ['=', '+', '-', '*', '/', '%', '<', '>'].includes(char);
    if (isBinaryOp) {
      // Check if it's actually a binary operator (not part of something else)
      const isActuallyBinary =
        (char === '=' && nextChar !== '=') ||
        (char === '!' && nextChar === '=') ||
        (char === '<' || char === '>') ||
        (['+', '-', '*', '/', '%'].includes(char));

      if (isActuallyBinary) {
        // Add space before if needed
        if (prevResultChar && prevResultChar !== ' ' && prevResultChar !== '(') {
          result += ' ';
        }
        result += char;
        // Add space after if needed
        if (nextChar && nextChar !== ' ') {
          result += ' ';
        }
        continue;
      }
    }

    // Default: just add the character
    result += char;
  }

  return result;
}
