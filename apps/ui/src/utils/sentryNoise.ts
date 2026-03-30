function getExceptionValues(
  event: unknown
): Array<{ value?: string; mechanism?: { type?: string } }> {
  if (!event || typeof event !== 'object') {
    return [];
  }

  const values = (event as { exception?: { values?: unknown } }).exception?.values;
  return Array.isArray(values)
    ? (values.filter((value): value is { value?: string; mechanism?: { type?: string } } => {
        return Boolean(value && typeof value === 'object');
      }) as Array<{ value?: string; mechanism?: { type?: string } }>)
    : [];
}

function getSerializedExtra(event: unknown): Record<string, unknown> | null {
  if (!event || typeof event !== 'object') {
    return null;
  }

  const serialized = (event as { extra?: { __serialized__?: unknown } }).extra?.__serialized__;
  return serialized && typeof serialized === 'object' && !Array.isArray(serialized)
    ? (serialized as Record<string, unknown>)
    : null;
}

export function shouldDropSentryEvent(event: unknown): boolean {
  const hasOpaqueBrowserRejection = getExceptionValues(event).some((exception) => {
    const value = exception.value ?? '';
    return (
      /captured as promise rejection/i.test(value) &&
      /event/i.test(value) &&
      /onunhandledrejection/i.test(exception.mechanism?.type ?? '')
    );
  });

  if (!hasOpaqueBrowserRejection) {
    return false;
  }

  const serialized = getSerializedExtra(event);
  if (!serialized) {
    return false;
  }

  return serialized.type === 'error' && /script/i.test(String(serialized.target ?? ''));
}
