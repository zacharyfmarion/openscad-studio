const IMPLICIT_OPENSCAD_ERROR_PATTERNS = [
  /^Current top level object is not a [23]D object\.$/i,
  /^No top level geometry to render\.$/i,
];

export class ExportValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ExportValidationError';
  }
}

export function isImplicitOpenScadError(line: string): boolean {
  const normalized = line.trim();
  return IMPLICIT_OPENSCAD_ERROR_PATTERNS.some((pattern) => pattern.test(normalized));
}

export function createExportValidationError(messages: string[]): ExportValidationError {
  const normalizedMessages = Array.from(
    new Set(messages.map((message) => message.trim()).filter(Boolean))
  );

  return new ExportValidationError(`Export failed:\n${normalizedMessages.join('\n')}`);
}

export function isExportValidationError(error: unknown): error is ExportValidationError {
  return error instanceof ExportValidationError;
}
