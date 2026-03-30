/** @jest-environment jsdom */

import { renderWithProviders } from './test-utils';
import { jest } from '@jest/globals';

const useModelsMock = jest.fn();
const notifyErrorMock = jest.fn();

jest.unstable_mockModule('@/hooks/useModels', () => ({
  useModels: useModelsMock,
}));

jest.unstable_mockModule('@/utils/notifications', () => ({
  notifyError: notifyErrorMock,
  normalizeAppError: (error: unknown, fallbackMessage = 'Something went wrong') => ({
    message:
      error instanceof Error ? error.message : typeof error === 'string' ? error : fallbackMessage,
  }),
}));

let ModelSelector: typeof import('../ModelSelector').ModelSelector;

describe('ModelSelector error handling', () => {
  beforeAll(async () => {
    ({ ModelSelector } = await import('../ModelSelector'));
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('surfaces provider network failures as handled refresh errors', () => {
    useModelsMock.mockReturnValue({
      groupedByProvider: { anthropic: [], openai: [] },
      isLoading: false,
      error: new Error('Failed to fetch'),
      fromCache: false,
      refreshModels: jest.fn(),
    });

    renderWithProviders(
      <ModelSelector
        currentModel="claude-sonnet-4-5"
        availableProviders={['anthropic']}
        onChange={jest.fn()}
      />
    );

    expect(notifyErrorMock).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: 'refresh-models',
        capture: false,
        displayMessage:
          'Could not reach the AI service. Check your internet connection and provider access, then try again.',
        fallbackMessage: 'Failed to refresh models',
        toastId: 'refresh-models-error',
      })
    );
  });

  it('keeps unexpected refresh failures reportable', () => {
    useModelsMock.mockReturnValue({
      groupedByProvider: { anthropic: [], openai: [] },
      isLoading: false,
      error: new Error('Unexpected parser failure'),
      fromCache: false,
      refreshModels: jest.fn(),
    });

    renderWithProviders(
      <ModelSelector
        currentModel="claude-sonnet-4-5"
        availableProviders={['anthropic']}
        onChange={jest.fn()}
      />
    );

    expect(notifyErrorMock).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: 'refresh-models',
        capture: true,
        displayMessage: 'Unexpected parser failure',
      })
    );
  });
});
