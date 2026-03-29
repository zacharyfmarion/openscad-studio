/** @jest-environment jsdom */

import { getAiErrorHandling } from '../aiErrors';

describe('aiErrors', () => {
  it('treats provider billing failures as handled user-facing errors', () => {
    expect(
      getAiErrorHandling({
        error: {
          message:
            'Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits.',
        },
      })
    ).toEqual({
      displayMessage:
        'Your Anthropic account has no available credits. Update billing and try again.',
      capture: false,
    });
  });

  it('treats unavailable model errors as handled configuration issues', () => {
    expect(getAiErrorHandling({ reason: { message: 'model: claude-opus-4' } })).toEqual({
      displayMessage: 'The selected model is unavailable. Choose another model and try again.',
      capture: false,
    });
  });

  it('preserves unexpected application failures for Sentry capture', () => {
    expect(getAiErrorHandling(new Error('Cannot read properties of undefined'))).toEqual({
      displayMessage: 'Cannot read properties of undefined',
      capture: true,
    });
  });
});
