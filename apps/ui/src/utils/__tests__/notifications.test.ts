import { jest } from '@jest/globals';

jest.mock('sonner', () => ({
  toast: {
    error: jest.fn(),
    success: jest.fn(),
    promise: jest.fn((promise: Promise<unknown>) => promise),
  },
}));

import { toast } from 'sonner';
import { normalizeAppError, notifyError, notifyPromise, notifySuccess } from '../notifications';

describe('notifications', () => {
  let consoleErrorSpy: ReturnType<typeof jest.spyOn>;

  beforeEach(() => {
    jest.clearAllMocks();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it('normalizes unknown errors into a stable fallback message', () => {
    expect(normalizeAppError(undefined, 'Fallback error')).toEqual({
      message: 'Fallback error',
    });
  });

  it('passes the toast id through for deduped error notifications', () => {
    notifyError({
      operation: 'open-file',
      error: new Error('No such file or directory'),
      toastId: 'open-file-error',
      fallbackMessage: 'Failed to open file',
    });

    expect(toast.error).toHaveBeenCalledWith('No such file or directory', {
      id: 'open-file-error',
      description: undefined,
    });
  });

  it('uses the shared success notifier', () => {
    notifySuccess('Exported successfully', { toastId: 'export-success' });

    expect(toast.success).toHaveBeenCalledWith('Exported successfully', {
      id: 'export-success',
      description: undefined,
    });
  });

  it('wraps toast.promise with normalized error handling', async () => {
    await notifyPromise(Promise.resolve('done'), {
      loading: 'Loading',
      success: (value) => `Success: ${value}`,
      error: (error) => `Error: ${error.message}`,
      toastId: 'promise-toast',
    });

    expect(toast.promise).toHaveBeenCalled();
  });
});
