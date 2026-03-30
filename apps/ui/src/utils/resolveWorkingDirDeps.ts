/**
 * Targeted dependency resolver for OpenSCAD working directory files.
 *
 * Instead of blindly scanning the entire working directory (which is disastrous
 * when a .scad file lives in ~/Documents), this module:
 * 1. Parses `include <…>` / `use <…>` from the source code
 * 2. Filters out paths already satisfied by library files (BOSL2 etc.)
 * 3. Reads only the referenced files from disk
 * 4. Recursively resolves transitive includes
 *
 * The result is a minimal `Record<relativePath, content>` of exactly the
 * working-directory files needed for rendering.
 */

import { parseIncludes } from './includeParser';
import type { PlatformBridge } from '../platform/types';

/** Safety limits to prevent runaway resolution */
const MAX_FILES = 200;
const MAX_DEPTH = 10;

export interface ResolveOptions {
  /** Absolute path to the working directory (parent of the active file) */
  workingDir: string;
  /** Already-loaded library files (keys are relative paths like "BOSL2/std.scad") */
  libraryFiles: Record<string, string>;
  /** Platform bridge for file I/O */
  platform: PlatformBridge;
  /**
   * Optional project files from the projectStore.
   * Checked before hitting disk. On web (no disk), this is the only source.
   */
  projectFiles?: Record<string, string>;
}

/**
 * Normalize a relative path by resolving `.` and `..` segments.
 * Does NOT touch the filesystem — pure string manipulation.
 *
 * Examples:
 *   "sub/../file.scad" → "file.scad"
 *   "./sub/file.scad" → "sub/file.scad"
 *   "a/b/../../c.scad" → "c.scad"
 */
export function normalizePath(p: string): string {
  const parts = p.split('/');
  const resolved: string[] = [];

  for (const part of parts) {
    if (part === '.' || part === '') continue;
    if (part === '..') {
      resolved.pop();
    } else {
      resolved.push(part);
    }
  }

  return resolved.join('/');
}

/**
 * Resolve working-directory dependencies for the given OpenSCAD source code.
 *
 * Returns a map of `{ relativePath: fileContent }` containing only the files
 * that the code (and its transitive includes) actually reference from the
 * working directory.
 */
export async function resolveWorkingDirDeps(
  code: string,
  options: ResolveOptions
): Promise<Record<string, string>> {
  const { workingDir, libraryFiles, platform, projectFiles } = options;
  const result: Record<string, string> = {};
  const visited = new Set<string>();

  async function resolve(sourceCode: string, depth: number): Promise<void> {
    if (depth > MAX_DEPTH) {
      console.warn('[resolveWorkingDirDeps] Max recursion depth reached');
      return;
    }

    const directives = parseIncludes(sourceCode);

    for (const directive of directives) {
      const normalizedPath = normalizePath(directive.path);

      // Skip if already resolved
      if (visited.has(normalizedPath)) continue;
      visited.add(normalizedPath);

      // Skip if satisfied by library files
      if (normalizedPath in libraryFiles) continue;

      // Skip if we've hit the file limit
      if (Object.keys(result).length >= MAX_FILES) {
        console.warn('[resolveWorkingDirDeps] Max file limit reached');
        return;
      }

      // Check project store first (works on both web and desktop)
      if (projectFiles && normalizedPath in projectFiles) {
        const content = projectFiles[normalizedPath];
        result[normalizedPath] = content;
        await resolve(content, depth + 1);
        continue;
      }

      // Fall back to reading from disk (desktop only, web returns null)
      const absolutePath = workingDir + '/' + normalizedPath;
      const content = await platform.readTextFile(absolutePath);

      if (content === null) {
        // File doesn't exist in working dir — might be resolved by OpenSCAD
        // via other means, or it's a genuine error that OpenSCAD will report
        continue;
      }

      result[normalizedPath] = content;

      // Recursively resolve this file's own includes
      await resolve(content, depth + 1);
    }
  }

  await resolve(code, 0);
  return result;
}
