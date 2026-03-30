const REDACTED = '[REDACTED]';

const SENSITIVE_KEY_PATTERN =
  /(api[_-]?key|token|secret|password|authorization|cookie|set-cookie|prompt|code|content|attachment|diagnostic|transcript|conversation|file(_name|_path)?|path|html|image|preview|dsn)/i;

const PURE_PATH_VALUE_PATTERN =
  /^(https?:\/\/\S+|tauri:\/\/\S+|asset:\/\/\S+|\/\S+|[A-Za-z]:\\\S+)$/i;
const URL_VALUE_PATTERN = /\b(?:https?|tauri|asset):\/\/[^\s)]+/gi;
const PATH_FRAGMENT_PATTERN = /(^|[\s(:])((?:\/[^)\s]+)+|(?:[A-Za-z]:\\[^\s)]+))/g;

const TOKEN_VALUE_PATTERNS = [
  /\bsk-(proj-)?[A-Za-z0-9_-]+\b/g,
  /\bsk-ant-[A-Za-z0-9_-]+\b/g,
  /\bsntrys_[A-Za-z0-9._-]+\b/g,
  /\bBearer\s+[A-Za-z0-9._-]+\b/gi,
];

export function redactSentryString(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return value;
  }

  if (PURE_PATH_VALUE_PATTERN.test(trimmed)) {
    return REDACTED;
  }

  let sanitized = value
    .replace(URL_VALUE_PATTERN, REDACTED)
    .replace(PATH_FRAGMENT_PATTERN, (_, prefix: string) => `${prefix}${REDACTED}`);
  for (const pattern of TOKEN_VALUE_PATTERNS) {
    sanitized = sanitized.replace(pattern, REDACTED);
  }

  return sanitized;
}

export function sanitizeSentryValue(key: string, value: unknown, depth: number): unknown {
  if (value === null) {
    return null;
  }

  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : undefined;
  }

  if (typeof value === 'string') {
    if (SENSITIVE_KEY_PATTERN.test(key)) {
      return REDACTED;
    }

    return redactSentryString(value);
  }

  if (Array.isArray(value)) {
    if (depth <= 0) {
      return undefined;
    }

    const sanitized = value
      .slice(0, 20)
      .map((item) => sanitizeSentryValue(key, item, depth - 1))
      .filter((item) => item !== undefined);

    return sanitized.length > 0 ? sanitized : undefined;
  }

  if (typeof value === 'object') {
    if (depth <= 0) {
      return undefined;
    }

    const sanitizedEntries = Object.entries(value as Record<string, unknown>)
      .map(([childKey, childValue]) => {
        if (SENSITIVE_KEY_PATTERN.test(childKey)) {
          return [childKey, REDACTED] as const;
        }

        return [childKey, sanitizeSentryValue(childKey, childValue, depth - 1)] as const;
      })
      .filter(([, childValue]) => childValue !== undefined);

    return sanitizedEntries.length > 0 ? Object.fromEntries(sanitizedEntries) : undefined;
  }

  return undefined;
}

export function sanitizeSentryEvent<T>(value: T): T {
  if (!value) {
    return value;
  }

  return sanitizeSentryValue('event', value as unknown, 6) as T;
}
