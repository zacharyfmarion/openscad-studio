import { toast } from 'sonner';
import {
  trackAnalyticsError,
  inferErrorDomain,
  type AnalyticsErrorDomain,
} from '../analytics/runtime';
import { captureSentryException } from '../sentry';

export interface NormalizedAppError {
  message: string;
  detail?: string;
}

export interface UiErrorContext {
  operation: string;
  error?: unknown;
  capture?: boolean;
  fallbackMessage?: string;
  displayMessage?: string;
  toastId?: string;
  logLabel?: string;
  description?: string;
  errorDomain?: AnalyticsErrorDomain;
  sourceComponent?: string;
  handled?: boolean;
  analyticsProperties?: Record<string, unknown>;
}

export interface NotifyOperationOptions<T> {
  loading: string;
  success: string | ((value: T) => string);
  error: string | ((error: NormalizedAppError) => string);
  toastId?: string;
  logLabel?: string;
}

function coerceNestedErrorMessage(
  error: unknown,
  depth: number,
  seen: WeakSet<object>
): string | null {
  if (depth <= 0) {
    return null;
  }

  if (error instanceof Error) {
    const cause = 'cause' in error ? (error as Error & { cause?: unknown }).cause : undefined;
    return error.message || coerceNestedErrorMessage(cause, depth - 1, seen) || error.name || null;
  }

  if (typeof error === 'string') {
    return error.trim() || null;
  }

  if (typeof error === 'object' && error !== null) {
    if (seen.has(error)) {
      return null;
    }

    seen.add(error);

    const candidates = [
      (error as Record<string, unknown>).message,
      (error as Record<string, unknown>).detail,
      (error as Record<string, unknown>).reason,
      (error as Record<string, unknown>).error,
      (error as Record<string, unknown>).cause,
      (error as Record<string, unknown>).data,
    ];

    for (const candidate of candidates) {
      const message = coerceNestedErrorMessage(candidate, depth - 1, seen);
      if (message) {
        return message;
      }
    }
  }

  return null;
}

function toSerializableDetail(value: unknown, depth: number, seen: WeakSet<object>): unknown {
  if (depth <= 0) {
    return undefined;
  }

  if (value === null || typeof value === 'boolean' || typeof value === 'number') {
    return value;
  }

  if (typeof value === 'string') {
    return value;
  }

  if (value instanceof Error) {
    const cause = 'cause' in value ? (value as Error & { cause?: unknown }).cause : undefined;
    const serialized: Record<string, unknown> = {
      name: value.name,
      message: value.message,
    };

    const serializedCause = toSerializableDetail(cause, depth - 1, seen);
    if (serializedCause !== undefined) {
      serialized.cause = serializedCause;
    }

    return serialized;
  }

  if (Array.isArray(value)) {
    const serialized = value
      .map((item) => toSerializableDetail(item, depth - 1, seen))
      .filter((item) => item !== undefined);
    return serialized.length > 0 ? serialized : undefined;
  }

  if (typeof value === 'object') {
    if (seen.has(value)) {
      return '[Circular]';
    }

    seen.add(value);

    const serialized = Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .map(
          ([key, childValue]) => [key, toSerializableDetail(childValue, depth - 1, seen)] as const
        )
        .filter(([, childValue]) => childValue !== undefined)
    );

    return Object.keys(serialized).length > 0 ? serialized : undefined;
  }

  return String(value);
}

function coerceErrorDetail(error: unknown): string | undefined {
  if (typeof error === 'string' || error === undefined) {
    return undefined;
  }

  const serialized = toSerializableDetail(error, 5, new WeakSet());
  if (serialized === undefined) {
    return undefined;
  }

  if (typeof serialized === 'string') {
    return serialized;
  }

  try {
    return JSON.stringify(serialized);
  } catch {
    return undefined;
  }
}

export function coerceErrorMessage(error: unknown): string | null {
  return coerceNestedErrorMessage(error, 5, new WeakSet());
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
    detail: coerceErrorDetail(error),
  };
}

export function notifyError({
  operation,
  error,
  capture = true,
  fallbackMessage,
  displayMessage,
  toastId,
  logLabel,
  description,
  errorDomain,
  sourceComponent,
  handled,
  analyticsProperties,
}: UiErrorContext): NormalizedAppError {
  const normalized = normalizeAppError(error, fallbackMessage ?? operation);

  if (error !== undefined) {
    console.error(logLabel ?? `[${operation}]`, error);
    if (capture) {
      captureSentryException(error, {
        tags: {
          operation,
          error_domain: errorDomain ?? inferErrorDomain(operation),
        },
        extra: {
          source_component: sourceComponent ?? logLabel ?? operation,
          handled: handled ?? true,
          ...analyticsProperties,
        },
      });
    }
  }

  toast.error(displayMessage ?? normalized.message, {
    id: toastId,
    description,
  });

  trackAnalyticsError({
    operation,
    error,
    errorDomain,
    handled,
    sourceComponent: sourceComponent ?? logLabel ?? operation,
    properties: analyticsProperties,
  });

  return normalized;
}

export function notifySuccess(
  message: string,
  options?: { toastId?: string; description?: string }
) {
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
