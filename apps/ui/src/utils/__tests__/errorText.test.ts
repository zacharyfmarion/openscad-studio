import { extractErrorText, humanizeStreamError } from '../errorText';

describe('errorText helpers', () => {
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

  it('keeps the fetch-specific AI guidance', () => {
    expect(humanizeStreamError({ message: 'Failed to fetch' })).toBe(
      'Could not reach the AI service - check your internet connection.'
    );
  });
});
