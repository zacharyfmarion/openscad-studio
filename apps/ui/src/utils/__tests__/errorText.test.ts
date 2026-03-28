import { extractErrorText, humanizeStreamError } from '../errorText';

describe('errorText helpers', () => {
  function createApiCallError(message: string, data?: unknown) {
    const error = new Error(message) as Error & {
      name: string;
      url: string;
      requestBodyValues: unknown;
      statusCode?: number;
      responseHeaders?: Record<string, string>;
      responseBody?: string;
      data?: unknown;
    };

    error.name = 'AI_APICallError';
    error.url = 'https://api.example.com/v1/responses';
    error.requestBodyValues = { model: 'test-model' };
    error.statusCode = 429;
    error.responseHeaders = { 'x-request-id': 'req_123' };
    error.responseBody = data == null ? undefined : JSON.stringify(data);
    error.data = data;

    return error;
  }

  it('returns the message from a normal Error instance', () => {
    expect(extractErrorText(new Error('plain failure'))).toBe('plain failure');
  });

  it('falls back to the error name when the Error message is empty', () => {
    const error = new Error('');
    error.name = 'ProviderError';

    expect(extractErrorText(error)).toBe('ProviderError');
  });

  it('preserves the full APICallError message for OpenAI errors', () => {
    const error = createApiCallError('Rate limit exceeded for model gpt-5', {
      error: {
        message: 'quota exceeded',
        type: 'insufficient_quota',
        code: 'insufficient_quota',
        param: null,
      },
    });

    expect(extractErrorText(error)).toBe('Rate limit exceeded for model gpt-5');
    expect(humanizeStreamError(error)).toBe('Failed: Rate limit exceeded for model gpt-5');
  });

  it('preserves the full APICallError message for Anthropic errors', () => {
    const error = createApiCallError('Claude rate limit exceeded', {
      type: 'error',
      error: {
        type: 'rate_limit_error',
        message: 'This request would exceed your rate limit.',
      },
    });

    expect(extractErrorText(error)).toBe('Claude rate limit exceeded');
    expect(humanizeStreamError(error)).toBe('Failed: Claude rate limit exceeded');
  });

  it('extracts the message from the raw OpenAI provider error shape', () => {
    const error = {
      error: {
        message: 'quota exceeded',
        type: 'insufficient_quota',
        code: 'insufficient_quota',
        param: null,
      },
    };

    expect(extractErrorText(error)).toBe('quota exceeded');
  });

  it('extracts the message from the raw Anthropic provider error shape', () => {
    const error = {
      type: 'error',
      error: {
        type: 'rate_limit_error',
        message: 'This request would exceed your rate limit.',
      },
    };

    expect(extractErrorText(error)).toBe('This request would exceed your rate limit.');
  });

  it('prefers a top-level string message before nested objects', () => {
    const error = {
      message: 'Top level API message',
      error: {
        message: 'nested detail',
      },
    };

    expect(extractErrorText(error)).toBe('Top level API message');
  });

  it('unwraps nested structured messages instead of stringifying to [object Object]', () => {
    const error = {
      message: {
        error: {
          message: 'quota exceeded',
        },
      },
    };

    expect(extractErrorText(error)).toBe('quota exceeded');
    expect(humanizeStreamError(error)).toBe('Failed: quota exceeded');
  });

  it('uses statusText when no message fields are available', () => {
    expect(extractErrorText({ statusText: 'Bad Gateway' })).toBe('Bad Gateway');
  });

  it('stringifies primitive values', () => {
    expect(extractErrorText(429)).toBe('429');
    expect(extractErrorText(false)).toBe('false');
    expect(extractErrorText(10n)).toBe('10');
  });

  it('uses the nested cause message when present', () => {
    expect(
      extractErrorText({
        cause: {
          message: 'socket hang up',
        },
      })
    ).toBe('socket hang up');
  });

  it('falls back to JSON for serializable objects without known message fields', () => {
    expect(extractErrorText({ foo: 'bar', retryable: true })).toBe(
      '{"foo":"bar","retryable":true}'
    );
  });

  it('falls back to String(object) when serialization fails', () => {
    const error: Record<string, unknown> = {};
    error.self = error;

    expect(extractErrorText(error)).toBe('[object Object]');
  });

  it('keeps the fetch-specific AI guidance', () => {
    expect(humanizeStreamError({ message: 'Failed to fetch' })).toBe(
      'Could not reach the AI service - check your internet connection.'
    );
  });

  it('keeps the fetch-specific guidance for browser TypeError failures', () => {
    expect(humanizeStreamError(new TypeError('Failed to fetch'))).toBe(
      'Could not reach the AI service - check your internet connection.'
    );
  });
});
