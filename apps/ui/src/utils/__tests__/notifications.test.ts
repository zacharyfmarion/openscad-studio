/** @jest-environment jsdom */

import { jest } from '@jest/globals';

jest.unstable_mockModule('sonner', () => ({
  toast: {
    error: jest.fn(),
    success: jest.fn(),
    promise: jest.fn((promise: Promise<unknown>) => promise),
  },
}));

jest.unstable_mockModule('../../sentry', () => ({
  captureSentryException: jest.fn(),
}));

let toast: typeof import('sonner').toast;
let captureSentryException: typeof import('../../sentry').captureSentryException;
let normalizeAppError: typeof import('../notifications').normalizeAppError;
let notifyError: typeof import('../notifications').notifyError;
let notifyPromise: typeof import('../notifications').notifyPromise;
let notifySuccess: typeof import('../notifications').notifySuccess;

describe('notifications', () => {
  let consoleErrorSpy: ReturnType<typeof jest.spyOn>;

  beforeAll(async () => {
    ({ toast } = await import('sonner'));
    ({ captureSentryException } = await import('../../sentry'));
    ({ normalizeAppError, notifyError, notifyPromise, notifySuccess } =
      await import('../notifications'));
  });

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

  it('can skip Sentry capture for handled UI validation errors', () => {
    notifyError({
      operation: 'export-file',
      error: new Error('Current top level object is not a 2D object.'),
      capture: false,
      fallbackMessage: 'Export failed',
    });

    expect(captureSentryException).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith('Current top level object is not a 2D object.', {
      id: undefined,
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
