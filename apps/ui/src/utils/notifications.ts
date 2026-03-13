import { toast } from 'sonner';

export interface NormalizedAppError {
  message: string;
  detail?: string;
}

export interface UiErrorContext {
  operation: string;
  error?: unknown;
  fallbackMessage?: string;
  toastId?: string;
  logLabel?: string;
  description?: string;
}

export interface NotifyOperationOptions<T> {
  loading: string;
  success: string | ((value: T) => string);
  error: string | ((error: NormalizedAppError) => string);
  toastId?: string;
  logLabel?: string;
}

function coerceErrorMessage(error: unknown): string | null {
  if (error instanceof Error) {
    return error.message || error.name || null;
  }
  if (typeof error === 'string') {
    return error.trim() || null;
  }
  if (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof (error as { message?: unknown }).message === 'string'
  ) {
    return ((error as { message: string }).message || '').trim() || null;
  }
  return null;
}

export function normalizeAppError(
  error: unknown,
  fallbackMessage: string = 'Something went wrong'
): NormalizedAppError {
  const message = coerceErrorMessage(error);
  if (!message) {
    return { message: fallbackMessage };
  }

  return {
    message,
    detail: typeof error === 'string' ? undefined : String(error),
  };
}

export function notifyError({
  operation,
  error,
  fallbackMessage,
  toastId,
  logLabel,
  description,
}: UiErrorContext): NormalizedAppError {
  const normalized = normalizeAppError(error, fallbackMessage ?? operation);

  if (error !== undefined) {
    console.error(logLabel ?? `[${operation}]`, error);
  }

  toast.error(normalized.message, {
    id: toastId,
    description,
  });

  return normalized;
}

export function notifySuccess(message: string, options?: { toastId?: string; description?: string }) {
  toast.success(message, {
    id: options?.toastId,
    description: options?.description,
  });
}

export async function notifyPromise<T>(
  promise: Promise<T>,
  options: NotifyOperationOptions<T>
): Promise<T> {
  toast.promise(promise, {
    id: options.toastId,
    loading: options.loading,
    success: (value) =>
      typeof options.success === 'function' ? options.success(value) : options.success,
    error: (error) => {
      if (error !== undefined) {
        console.error(options.logLabel ?? `[${options.loading}]`, error);
      }

      const normalized = normalizeAppError(error, options.loading);
      return typeof options.error === 'function' ? options.error(normalized) : options.error;
    },
  });

  return promise;
}
