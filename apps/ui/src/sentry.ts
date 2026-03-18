import * as Sentry from '@sentry/react';
import { APP_VERSION } from './constants/appInfo';

const REDACTED = '[REDACTED]';

const SENSITIVE_KEY_PATTERN =
  /(api[_-]?key|token|secret|password|authorization|cookie|set-cookie|prompt|code|content|attachment|diagnostic|transcript|conversation|file(_name|_path)?|path|html|image|preview|dsn)/i;

const PATH_VALUE_PATTERN =
  /(^\/)|(^[A-Za-z]:\\)|([/\\][^/\\]+\.[a-z0-9]{1,8}$)|([/\\](users|home|documents|desktop|downloads|library|appdata)([/\\]|$))/i;

const TOKEN_VALUE_PATTERNS = [
  /\bsk-(proj-)?[A-Za-z0-9_-]+\b/g,
  /\bsk-ant-[A-Za-z0-9_-]+\b/g,
  /\bsntrys_[A-Za-z0-9._-]+\b/g,
  /\bBearer\s+[A-Za-z0-9._-]+\b/gi,
];

const sentryDsn = import.meta.env.VITE_SENTRY_DSN?.trim();
const sentryEnabled = Boolean(sentryDsn);

function redactString(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return value;
  }

  if (PATH_VALUE_PATTERN.test(trimmed)) {
    return REDACTED;
  }

  let sanitized = value;
  for (const pattern of TOKEN_VALUE_PATTERNS) {
    sanitized = sanitized.replace(pattern, REDACTED);
  }

  return sanitized;
}

function sanitizeValue(key: string, value: unknown, depth: number): unknown {
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

    return redactString(value);
  }

  if (Array.isArray(value)) {
    if (depth <= 0) {
      return undefined;
    }

    const sanitized = value
      .slice(0, 20)
      .map((item) => sanitizeValue(key, item, depth - 1))
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

        return [childKey, sanitizeValue(childKey, childValue, depth - 1)] as const;
      })
      .filter(([, childValue]) => childValue !== undefined);

    return sanitizedEntries.length > 0 ? Object.fromEntries(sanitizedEntries) : undefined;
  }

  return undefined;
}

function sanitizeEvent<T>(value: T): T {
  if (!value) {
    return value;
  }

  return sanitizeValue('event', value as unknown, 6) as T;
}

if (sentryEnabled) {
  Sentry.init({
    dsn: sentryDsn,
    enabled: true,
    environment: import.meta.env.VITE_SENTRY_ENVIRONMENT ?? import.meta.env.MODE,
    release: `openscad-studio@${APP_VERSION}`,
    sendDefaultPii: false,
    maxBreadcrumbs: 0,
    normalizeDepth: 4,
    beforeSend(event) {
      return sanitizeEvent(event) as typeof event;
    },
    beforeBreadcrumb(breadcrumb) {
      return sanitizeEvent(breadcrumb) as typeof breadcrumb;
    },
  });
}

export function captureSentryException(
  error: unknown,
  context?: {
    tags?: Record<string, string>;
    extra?: Record<string, unknown>;
  }
) {
  if (!sentryEnabled) {
    return;
  }

  Sentry.withScope((scope) => {
    for (const [key, value] of Object.entries(context?.tags ?? {})) {
      scope.setTag(key, value);
    }

    const extra = sanitizeValue('extra', context?.extra ?? {}, 4);
    if (extra && typeof extra === 'object' && !Array.isArray(extra)) {
      for (const [key, value] of Object.entries(extra)) {
        scope.setExtra(key, value);
      }
    }

    Sentry.captureException(error);
  });
}

export function isSentryEnabled() {
  return sentryEnabled;
}
