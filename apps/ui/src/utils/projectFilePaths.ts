export function normalizeProjectRelativePath(input: string): string | null {
  const normalizedInput = input.trim().replace(/\\/g, '/');
  if (!normalizedInput || normalizedInput.startsWith('/')) {
    return null;
  }

  const resolved: string[] = [];
  for (const part of normalizedInput.split('/')) {
    if (!part || part === '.') {
      continue;
    }

    if (part === '..') {
      if (resolved.length === 0) {
        return null;
      }
      resolved.pop();
      continue;
    }

    resolved.push(part);
  }

  return resolved.length > 0 ? resolved.join('/') : null;
}

export function getRelativeProjectPath(
  workingDir: string | null,
  absolutePath: string | null
): string | null {
  if (!workingDir || !absolutePath) {
    return null;
  }

  const normalizedWorkingDir = workingDir.endsWith('/') ? workingDir : `${workingDir}/`;
  if (absolutePath.startsWith(normalizedWorkingDir)) {
    return normalizeProjectRelativePath(absolutePath.slice(normalizedWorkingDir.length));
  }

  const lastSlash = absolutePath.lastIndexOf('/');
  const fallbackName = lastSlash >= 0 ? absolutePath.slice(lastSlash + 1) : absolutePath;
  return normalizeProjectRelativePath(fallbackName);
}
