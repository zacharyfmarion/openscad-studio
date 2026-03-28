import {
  createExportValidationError,
  isExportValidationError,
  isImplicitOpenScadError,
} from '../exportErrors';

describe('exportErrors', () => {
  it('treats dimension mismatch stderr as an implicit OpenSCAD error', () => {
    expect(isImplicitOpenScadError('Current top level object is not a 2D object.')).toBe(true);
    expect(isImplicitOpenScadError('Current top level object is not a 3D object.')).toBe(true);
  });

  it('creates a typed export validation error with the OpenSCAD message', () => {
    const error = createExportValidationError(['Current top level object is not a 2D object.']);

    expect(isExportValidationError(error)).toBe(true);
    expect(error.message).toBe('Export failed:\nCurrent top level object is not a 2D object.');
  });
});
