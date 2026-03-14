const SENSITIVE_KEY_PATTERN =
  /(prompt|code|content|attachment|diagnostic|stack|trace|api[_-]?key|token|secret|password|authorization|cookie|path|filename|file_name|file_path|html|image|preview|value|transcript|conversation|message(_text)?)/i;

const PATH_VALUE_PATTERN =
  /(^\/)|(^[A-Za-z]:\\)|([/\\][^/\\]+\.[a-z0-9]{1,8}$)|([/\\](users|home|documents|desktop|downloads|library|appdata)([/\\]|$))/i;

function sanitizeString(key: string, value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (SENSITIVE_KEY_PATTERN.test(key)) return undefined;
  if (trimmed.length > 120) return undefined;
  if (trimmed.includes('\n') || trimmed.includes('\r')) return undefined;
  if (PATH_VALUE_PATTERN.test(trimmed)) return undefined;
  return trimmed;
}

function sanitizeValue(key: string, value: unknown, depth: number): unknown {
  if (value === null) return null;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value === 'string') return sanitizeString(key, value);

  if (Array.isArray(value)) {
    if (depth <= 0) return undefined;
    const sanitized = value
      .slice(0, 20)
      .map((item) => sanitizeValue(key, item, depth - 1))
      .filter((item) => item !== undefined);
    return sanitized.length > 0 ? sanitized : undefined;
  }

  if (typeof value === 'object') {
    if (depth <= 0 || value === null) return undefined;

    const sanitizedEntries = Object.entries(value as Record<string, unknown>)
      .map(
        ([childKey, childValue]) =>
          [childKey, sanitizeValue(childKey, childValue, depth - 1)] as const
      )
      .filter(([, childValue]) => childValue !== undefined);

    return sanitizedEntries.length > 0 ? Object.fromEntries(sanitizedEntries) : undefined;
  }

  return undefined;
}

export function sanitizeAnalyticsProperties(
  properties: Record<string, unknown> | null | undefined
): Record<string, unknown> {
  if (!properties) return {};

  return Object.fromEntries(
    Object.entries(properties)
      .map(([key, value]) => [key, sanitizeValue(key, value, 3)] as const)
      .filter(([, value]) => value !== undefined)
  );
}

export function scrubAndFilterEvent(event: unknown): unknown {
  if (!event || typeof event !== 'object') {
    return event;
  }

  const candidate = event as { properties?: Record<string, unknown> };
  return {
    ...candidate,
    properties: sanitizeAnalyticsProperties(candidate.properties),
  };
}
