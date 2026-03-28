function safeJsonStringify(value: unknown): string | null {
  try {
    const text = JSON.stringify(value);
    if (!text || text === '{}' || text === '[]') {
      return null;
    }
    return text;
  } catch {
    return null;
  }
}

export function extractErrorText(error: unknown): string {
  if (error instanceof Error) {
    return error.message || error.name || 'Unknown error';
  }

  if (typeof error === 'string') {
    return error;
  }

  if (
    typeof error === 'number' ||
    typeof error === 'boolean' ||
    typeof error === 'bigint' ||
    typeof error === 'symbol'
  ) {
    return String(error);
  }

  if (typeof error === 'object' && error !== null) {
    for (const key of ['message', 'error', 'cause', 'detail']) {
      if (key in error) {
        const nested = extractErrorText((error as Record<string, unknown>)[key]);
        if (nested && nested !== '[object Object]') {
          return nested;
        }
      }
    }

    if (
      'statusText' in error &&
      typeof (error as { statusText?: unknown }).statusText === 'string'
    ) {
      const statusText = (error as { statusText: string }).statusText.trim();
      if (statusText) {
        return statusText;
      }
    }

    const serialized = safeJsonStringify(error);
    if (serialized) {
      return serialized;
    }
  }

  return String(error);
}

export function humanizeStreamError(error: unknown): string {
  const errorText = extractErrorText(error);
  if (/failed to fetch/i.test(errorText)) {
    return 'Could not reach the AI service - check your internet connection.';
  }
  return `Failed: ${errorText}`;
}
