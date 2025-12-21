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
  const lines = code.split('\n').map((line) => line.trimEnd());

  const formatted: string[] = [];
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
const MULTI_CHAR_OPERATORS = ['<=', '>=', '==', '!=', '+=', '-=', '*=', '/=', '%='];

function formatLineContent(line: string): string {
  let result = '';
  let inString = false;
  let commentMode: 'line' | 'block' | null = null;
  let inImportPath = false;

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
    if (commentMode === 'line') {
      result += char;
      continue;
    }

    if (commentMode === 'block') {
      result += char;
      if (char === '*' && nextChar === '/') {
        result += nextChar;
        i++;
        commentMode = null;
      }
      continue;
    }

    if (char === '/' && nextChar === '/') {
      commentMode = 'line';
      result += char;
      continue;
    }

    if (char === '/' && nextChar === '*') {
      commentMode = 'block';
      result += char;
      continue;
    }

    if (!inImportPath && char === '<') {
      const trimmedResult = result.trimEnd();
      if (/\b(?:use|include)$/.test(trimmedResult)) {
        if (!result.endsWith(' ')) {
          result += ' ';
        }
        inImportPath = true;
        result += char;
        continue;
      }
    }

    if (inImportPath) {
      result += char;
      if (char === '>') {
        inImportPath = false;
      }
      continue;
    }

    if (!inImportPath) {
      const twoChar = line.slice(i, i + 2);
      if (MULTI_CHAR_OPERATORS.includes(twoChar)) {
        const prevResultChar = result[result.length - 1];
        if (prevResultChar && prevResultChar !== ' ' && prevResultChar !== '(') {
          result += ' ';
        }
        result += twoChar;
        const followingChar = line[i + 2];
        if (
          followingChar &&
          followingChar !== ' ' &&
          followingChar !== ')' &&
          followingChar !== ';' &&
          followingChar !== ','
        ) {
          result += ' ';
        }
        i++;
        continue;
      }
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
        char === '<' ||
        char === '>' ||
        ['+', '-', '*', '/', '%'].includes(char);

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

  const singleLineCommentIndex = result.indexOf('//');
  const blockCommentIndex = result.indexOf('/*');
  const commentIndexes = [singleLineCommentIndex, blockCommentIndex].filter((index) => index >= 0);
  const prefixEnd = commentIndexes.length > 0 ? Math.min(...commentIndexes) : result.length;
  const prefix = result.slice(0, prefixEnd);
  const suffix = result.slice(prefixEnd);

  const normalizedPrefix = prefix
    .replace(/}\s*else/g, '} else')
    .replace(/else\s*if/g, 'else if')
    .replace(/else\s*\{/g, 'else {')
    .replace(/\bif\s*\(/g, 'if (')
    .replace(/\bfor\s*\(/g, 'for (')
    .replace(/\bwhile\s*\(/g, 'while (')
    .replace(/\)\s*\{/g, ') {')
    .replace(/else if\s*\(([^)]*)\)\s*\{/g, 'else if ($1) {')
    .replace(
      /\b(if|for|while)\s*\(([^)]*)\)\s*\{/g,
      (_match, keyword, condition) => `${keyword} (${condition}) {`
    )
    .replace(/^(use|include)\s*<\s*([^>]+?)\s*>/g, '$1 <$2>');

  return normalizedPrefix + suffix;
}
