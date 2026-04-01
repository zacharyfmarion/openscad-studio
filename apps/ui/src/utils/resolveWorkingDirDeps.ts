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

import { parseIncludes, parseImports } from './includeParser';
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
  /**
   * Directory prefix of the render target relative to the project root
   * (e.g. "examples/keebcu" for render target "examples/keebcu/foo.scad").
   * When set, includes like `constants.scad` are also looked up as
   * `examples/keebcu/constants.scad` in projectFiles.
   */
  renderTargetDir?: string;
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
  const { workingDir, libraryFiles, platform, projectFiles, renderTargetDir } = options;
  const result: Record<string, string> = {};
  const visited = new Set<string>();

  /**
   * Look up a path in projectFiles, trying both the bare path and the
   * render-target-relative path.  Returns [matchedKey, content] or null.
   */
  function lookupProjectFile(path: string): [string, string] | null {
    if (!projectFiles) return null;
    if (path in projectFiles) return [path, projectFiles[path]];
    // Try prefixing with the render target's directory so that sibling
    // includes like `constants.scad` match `examples/keebcu/constants.scad`.
    if (renderTargetDir) {
      const prefixed = renderTargetDir + '/' + path;
      if (prefixed in projectFiles) return [prefixed, projectFiles[prefixed]];
    }
    return null;
  }

  /**
   * Resolve a single file path: check project store, then fall back to disk.
   * Tries both the bare path and the renderTargetDir-prefixed path (matching
   * the same fallback logic as lookupProjectFile).
   * Returns [matchedKey, content] or null if the file can't be found.
   */
  async function resolveFile(normalizedPath: string): Promise<[string, string] | null> {
    // Check project store first (works on both web and desktop)
    const match = lookupProjectFile(normalizedPath);
    if (match) return match;

    // Fall back to reading from disk (desktop only, web returns null)
    const absolutePath = workingDir + '/' + normalizedPath;
    const content = await platform.readTextFile(absolutePath);
    if (content !== null) return [normalizedPath, content];

    // Try renderTargetDir-prefixed path on disk (e.g. include <lib/foo.scad>
    // from render target examples/poly555/openscad/poly555.scad resolves to
    // examples/poly555/openscad/lib/foo.scad on disk).
    if (renderTargetDir) {
      const prefixed = renderTargetDir + '/' + normalizedPath;
      const prefixedAbsolute = workingDir + '/' + prefixed;
      const prefixedContent = await platform.readTextFile(prefixedAbsolute);
      if (prefixedContent !== null) return [prefixed, prefixedContent];
    }

    return null;
  }

  /**
   * Resolve include/use directives and import() calls from source code.
   * @param sourceCode - The OpenSCAD source code to parse
   * @param currentFileDir - Directory of the file being processed (project-relative,
   *   e.g. "examples/poly555/openscad/lib"), used to resolve import() paths.
   *   Empty string for files at the project root.
   * @param depth - Current recursion depth
   */
  async function resolve(sourceCode: string, currentFileDir: string, depth: number): Promise<void> {
    if (depth > MAX_DEPTH) {
      console.warn('[resolveWorkingDirDeps] Max recursion depth reached');
      return;
    }

    // --- include/use directives (paths relative to project root) ---
    const directives = parseIncludes(sourceCode);

    for (const directive of directives) {
      const normalizedPath = normalizePath(directive.path);

      if (visited.has(normalizedPath)) continue;
      visited.add(normalizedPath);
      if (normalizedPath in libraryFiles) continue;
      if (Object.keys(result).length >= MAX_FILES) {
        console.warn('[resolveWorkingDirDeps] Max file limit reached');
        return;
      }

      const resolved = await resolveFile(normalizedPath);
      if (!resolved) continue;

      const [matchedKey, content] = resolved;
      result[matchedKey] = content;

      // Derive the directory of this included file for its own import() resolution
      const lastSlash = matchedKey.lastIndexOf('/');
      const childDir = lastSlash > 0 ? matchedKey.substring(0, lastSlash) : '';
      await resolve(content, childDir, depth + 1);
    }

    // --- import() calls (paths relative to the containing file) ---
    const imports = parseImports(sourceCode);

    for (const imp of imports) {
      // Resolve the import path relative to the directory of the file that
      // contains the import() call, then normalize to a project-relative path.
      const joinedPath = currentFileDir ? currentFileDir + '/' + imp.path : imp.path;
      const normalizedPath = normalizePath(joinedPath);

      if (visited.has(normalizedPath)) continue;
      visited.add(normalizedPath);
      if (Object.keys(result).length >= MAX_FILES) {
        console.warn('[resolveWorkingDirDeps] Max file limit reached');
        return;
      }

      const resolved = await resolveFile(normalizedPath);
      if (!resolved) continue;

      const [matchedKey, content] = resolved;
      result[matchedKey] = content;
      // Do NOT recurse — imported files are assets (SVG/STL/DXF), not OpenSCAD code
    }
  }

  // Determine the render target's directory for the initial resolve call
  const initialDir = renderTargetDir ?? '';
  await resolve(code, initialDir, 0);
  return result;
}
