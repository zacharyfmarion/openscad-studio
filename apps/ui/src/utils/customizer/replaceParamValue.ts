/**
 * Utility for surgically replacing a customizer parameter value in OpenSCAD source code.
 *
 * Exported here so it can be unit-tested without importing the full React component.
 * The CustomizerPanel imports and re-uses this implementation.
 */

import type { CustomizerParam } from './types';

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Replace the value of a single parameter in `code`, returning the updated string.
 *
 * Strategy (in priority order):
 * 1. AST byte-range replacement — uses `valueStartIndex`/`valueEndIndex` stored by the
 *    parser. Validates that `rawValue` still sits at those offsets (guards against stale
 *    params from a debounce race). This is the only path that correctly handles string
 *    values containing semicolons (e.g. `label = "foo;bar";`).
 * 2. Regex fallback — confined to a single line via `[^;\n]+`. Handles the case where
 *    offsets are absent or stale. Named arguments (`foo = bar,`) are not matched because
 *    they lack a semicolon on the same line.
 */
export function replaceParamValue(
  code: string,
  param: Pick<CustomizerParam, 'name' | 'rawValue' | 'valueStartIndex' | 'valueEndIndex'>,
  nextValue: string
): string {
  if (param.valueStartIndex !== undefined && param.valueEndIndex !== undefined) {
    if (code.slice(param.valueStartIndex, param.valueEndIndex) === param.rawValue) {
      return code.slice(0, param.valueStartIndex) + nextValue + code.slice(param.valueEndIndex);
    }
  }
  const assignmentPattern = new RegExp(
    `^(\\s*${escapeRegExp(param.name)}\\s*=\\s*)([^;\n]+)(;.*)$`,
    'gm'
  );
  return code.replace(assignmentPattern, (_, prefix, __, suffix) => {
    return prefix + nextValue + suffix;
  });
}
