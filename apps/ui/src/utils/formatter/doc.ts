/**
 * Document IR (Intermediate Representation) for the pretty printer
 *
 * Based on Prettier's Doc format - provides primitives for building
 * formatted output with intelligent line breaking
 */

export type Doc =
  | string
  | Doc[]
  | { type: 'concat'; parts: Doc[] }
  | { type: 'line'; hard?: boolean; soft?: boolean }
  | { type: 'group'; contents: Doc; shouldBreak?: boolean }
  | { type: 'indent'; contents: Doc }
  | { type: 'if-break'; breakContents: Doc; flatContents: Doc }
  | { type: 'fill'; parts: Doc[] };

// Builders for Doc elements

export function concat(parts: Doc[]): Doc {
  return { type: 'concat', parts };
}

export function line(opts: { hard?: boolean; soft?: boolean } = {}): Doc {
  return { type: 'line', ...opts };
}

export function hardline(): Doc {
  return line({ hard: true });
}

export function softline(): Doc {
  return line({ soft: true });
}

export function group(contents: Doc, shouldBreak = false): Doc {
  return { type: 'group', contents, shouldBreak };
}

export function indent(contents: Doc): Doc {
  return { type: 'indent', contents };
}

export function ifBreak(breakContents: Doc, flatContents: Doc = ''): Doc {
  return { type: 'if-break', breakContents, flatContents };
}

export function fill(parts: Doc[]): Doc {
  return { type: 'fill', parts };
}

// Utility functions

export function join(sep: Doc, parts: Doc[]): Doc {
  const result: Doc[] = [];
  for (let i = 0; i < parts.length; i++) {
    if (i > 0) {
      result.push(sep);
    }
    result.push(parts[i]);
  }
  return concat(result);
}
