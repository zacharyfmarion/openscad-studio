/** @jest-environment jsdom */

import { shouldDropSentryEvent } from '../sentryNoise';

describe('sentryNoise', () => {
  it('drops opaque browser script-load promise rejections', () => {
    expect(
      shouldDropSentryEvent({
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
    ).toBe(true);
  });

  it('keeps regular application exceptions', () => {
    expect(
      shouldDropSentryEvent({
        exception: {
          values: [
            {
              value: 'Cannot read properties of undefined',
              mechanism: {
                type: 'generic',
              },
            },
          ],
        },
      })
    ).toBe(false);
  });
});
