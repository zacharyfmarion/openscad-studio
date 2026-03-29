import { normalizeAppError } from './notifications';

export interface AiErrorHandling {
  displayMessage: string;
  capture: boolean;
}

const NETWORK_ERROR_PATTERN = /failed to fetch|networkerror|load failed|network request failed/i;
const LOW_CREDITS_PATTERN = /credit balance is too low|plans?\s*&\s*billing|insufficient.*credits?/i;
const INVALID_KEY_PATTERN = /invalid x-api-key|authentication_error|incorrect api key|unauthorized/i;
const MODEL_UNAVAILABLE_PATTERN =
  /(^|\b)model:\s*[\w.-]+$|model .*not found|unknown model|unsupported model|does not exist/i;
const RATE_LIMIT_PATTERN = /rate limit|too many requests|quota exceeded/i;

function getExpectedAiFailureMessage(message: string): string | null {
  if (NETWORK_ERROR_PATTERN.test(message)) {
    return 'Could not reach the AI service. Check your internet connection and provider access, then try again.';
  }

  if (LOW_CREDITS_PATTERN.test(message)) {
    return 'Your Anthropic account has no available credits. Update billing and try again.';
  }

  if (INVALID_KEY_PATTERN.test(message)) {
    return 'Your Anthropic API key was rejected. Update it in Settings and try again.';
  }

  if (MODEL_UNAVAILABLE_PATTERN.test(message)) {
    return 'The selected model is unavailable. Choose another model and try again.';
  }

  if (RATE_LIMIT_PATTERN.test(message)) {
    return 'The AI provider is rate-limiting requests right now. Wait a moment and try again.';
  }

  return null;
}

export function getAiErrorHandling(
  error: unknown,
  fallbackMessage: string = 'AI request failed'
): AiErrorHandling {
  const normalized = normalizeAppError(error, fallbackMessage);
  const expectedMessage = getExpectedAiFailureMessage(normalized.message);

  if (expectedMessage) {
    return {
      displayMessage: expectedMessage,
      capture: false,
    };
  }

  return {
    displayMessage: normalized.message,
    capture: true,
  };
}
