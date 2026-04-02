/**
 * Returns true if dragging sourcePath onto targetFolderPath is a valid move.
 */
export function isValidDrop(
  sourcePath: string,
  sourceIsFolder: boolean,
  targetFolderPath: string
): boolean {
  const currentParent = sourcePath.includes('/')
    ? sourcePath.substring(0, sourcePath.lastIndexOf('/'))
    : '';
  // Already in this folder
  if (targetFolderPath === currentParent) return false;
  if (sourceIsFolder) {
    // Can't drop folder onto itself
    if (targetFolderPath === sourcePath) return false;
    // Can't drop folder into one of its own descendants
    if (targetFolderPath.startsWith(sourcePath + '/')) return false;
  }
  return true;
}
