import * as Sentry from '@sentry/react';
import { APP_VERSION } from './constants/appInfo';
import { sanitizeSentryEvent, sanitizeSentryValue } from './utils/sentrySanitize';
import { shouldDropSentryEvent } from './utils/sentryNoise';

const sentryDsn = import.meta.env.VITE_SENTRY_DSN?.trim();
const sentryEnabled = Boolean(sentryDsn);

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
      const sanitized = sanitizeSentryEvent(event) as typeof event;
      return shouldDropSentryEvent(sanitized) ? null : sanitized;
    },
    beforeBreadcrumb(breadcrumb) {
      return sanitizeSentryEvent(breadcrumb) as typeof breadcrumb;
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

    const extra = sanitizeSentryValue('extra', context?.extra ?? {}, 4);
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
