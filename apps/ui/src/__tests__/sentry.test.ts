/** @jest-environment jsdom */

import { shouldDropSentryEvent } from '../utils/sentryNoise';
import { sanitizeSentryEvent } from '../utils/sentrySanitize';

describe('sentry integration', () => {
  it('sanitizes events before applying the opaque browser rejection filter', () => {
    expect(
      shouldDropSentryEvent(
        sanitizeSentryEvent({
          exception: {
            values: [
              {
                value: 'Event `Event` (type=error) captured as promise rejection',
                mechanism: {
                  type: 'auto.browser.global_handlers.onunhandledrejection',
                },
              },
            ],
          },
          extra: {
            __serialized__: {
              type: 'error',
              target: 'body > script',
            },
          },
        })
      )
    ).toBe(true);
  });

  it('redacts embedded URLs and local path fragments while preserving surrounding context', () => {
    const sanitized = sanitizeSentryEvent({
      exception: {
        values: [
          {
            value:
              'Script failed at https://openscad-studio.pages.dev/assets/app.js while reading /Users/tester/Documents/private/file.scad',
            mechanism: { type: 'generic' },
          },
        ],
      },
      extra: {
        note: 'See https://example.com/private/report and /tmp/private.log for details',
      },
    }) as {
      exception: { values: Array<{ value?: string }> };
      extra: { note?: string };
    };

    expect(sanitized.exception.values[0].value).toContain('[REDACTED]');
    expect(sanitized.exception.values[0].value).not.toContain('openscad-studio.pages.dev');
    expect(sanitized.exception.values[0].value).not.toContain('/Users/tester/Documents/private');
    expect(sanitized.extra.note).toContain('[REDACTED]');
    expect(sanitized.extra.note).not.toContain('example.com/private');
    expect(sanitized.extra.note).not.toContain('/tmp/private.log');
  });

  it('redacts sensitive nested extra fields and preserves safe metadata', () => {
    const sanitized = sanitizeSentryEvent({
      extra: {
        handled: true,
        request_url: 'https://example.com/private',
        nested: {
          path: '/Users/tester/Documents/private/file.scad',
        },
      },
    }) as {
      extra: {
        handled: boolean;
        request_url: string;
        nested: { path: string };
      };
    };

    expect(sanitized.extra).toEqual({
      handled: true,
      request_url: '[REDACTED]',
      nested: {
        path: '[REDACTED]',
      },
    });
  });
});
