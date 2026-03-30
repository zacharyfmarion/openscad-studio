/** @jest-environment jsdom */

import { getAiErrorHandling } from '../aiErrors';

describe('aiErrors', () => {
  it('treats provider network failures as handled user-facing errors', () => {
    expect(getAiErrorHandling(new Error('Load failed (api.anthropic.com)'))).toEqual({
      displayMessage:
        'Could not reach the AI service. Check your internet connection and provider access, then try again.',
      capture: false,
    });
  });

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

  it('treats invalid API keys as handled configuration issues', () => {
    expect(
      getAiErrorHandling({ cause: { message: 'authentication_error: invalid x-api-key' } })
    ).toEqual({
      displayMessage: 'Your Anthropic API key was rejected. Update it in Settings and try again.',
      capture: false,
    });
  });

  it('treats unavailable model errors as handled configuration issues', () => {
    expect(getAiErrorHandling({ reason: { message: 'model: claude-opus-4' } })).toEqual({
      displayMessage: 'The selected model is unavailable. Choose another model and try again.',
      capture: false,
    });
  });

  it('treats provider rate-limit failures as handled retryable errors', () => {
    expect(
      getAiErrorHandling({
        detail: {
          message:
            "This request would exceed your organization's rate limit of 10,000 input tokens per minute",
        },
      })
    ).toEqual({
      displayMessage:
        'The AI provider is rate-limiting requests right now. Wait a moment and try again.',
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
