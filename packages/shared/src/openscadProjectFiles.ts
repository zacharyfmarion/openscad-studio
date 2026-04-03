export const OPENSCAD_PROJECT_FILE_EXTENSIONS = ['scad', 'h'] as const;
export const OPENSCAD_RENDERABLE_FILE_EXTENSIONS = ['scad'] as const;

function normalizePath(path: string): string {
  return path.trim().toLowerCase();
}

export function hasAllowedExtension(path: string, extensions: readonly string[]): boolean {
  const normalizedPath = normalizePath(path);
  return extensions.some((ext) => normalizedPath.endsWith(`.${ext.toLowerCase()}`));
}

export function isOpenScadProjectFilePath(path: string): boolean {
  return hasAllowedExtension(path, OPENSCAD_PROJECT_FILE_EXTENSIONS);
}

export function isRenderableOpenScadFilePath(path: string): boolean {
  return hasAllowedExtension(path, OPENSCAD_RENDERABLE_FILE_EXTENSIONS);
}

export function pickOpenScadRenderTarget(
  filePaths: Iterable<string>,
  preferredPath?: string | null
): string | null {
  const renderableFiles = [...filePaths]
    .filter(isRenderableOpenScadFilePath)
    .sort((a, b) => a.localeCompare(b));

  if (renderableFiles.length === 0) {
    return null;
  }

  if (preferredPath && renderableFiles.includes(preferredPath)) {
    return preferredPath;
  }

  return renderableFiles.find((path) => path === 'main.scad') ?? renderableFiles[0];
}
