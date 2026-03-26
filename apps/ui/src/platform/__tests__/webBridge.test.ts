import { jest } from '@jest/globals';

const mockShowSaveFilePicker = jest.fn();
const mockCreateWritable = jest.fn();
const mockWrite = jest.fn();
const mockClose = jest.fn();
const mockAnchorClick = jest.fn();
const mockAppendChild = jest.fn();
const mockRemoveChild = jest.fn();
const mockCreateObjectURL = jest.fn(() => 'blob:mock-url');
const mockRevokeObjectURL = jest.fn();

// Patch globals that webBridge accesses at call-time (not import-time, so order is fine)
Object.defineProperty(global, 'window', {
  value: {
    showOpenFilePicker: jest.fn(), // makes hasFileSystemAccess() return true
    showSaveFilePicker: mockShowSaveFilePicker,
  },
  writable: true,
});

// The fallback path calls bare `URL.createObjectURL` (not window.URL), so patch global.URL
Object.assign(URL, {
  createObjectURL: mockCreateObjectURL,
  revokeObjectURL: mockRevokeObjectURL,
});

Object.defineProperty(global, 'document', {
  value: {
    createElement: (tag: string) => {
      if (tag === 'a') return { href: '', download: '', click: mockAnchorClick };
      return undefined;
    },
    body: { appendChild: mockAppendChild, removeChild: mockRemoveChild },
  },
  writable: true,
});

import { WebBridge } from '../webBridge';

describe('WebBridge.fileExport', () => {
  const data = new Uint8Array([1, 2, 3]);
  const filename = 'export.stl';
  const filters = [{ name: 'STL Files', extensions: ['stl'] }];

  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateWritable.mockResolvedValue({ write: mockWrite, close: mockClose });
    mockWrite.mockResolvedValue(undefined);
    mockClose.mockResolvedValue(undefined);
    mockCreateObjectURL.mockReturnValue('blob:mock-url');
  });

  it('shows the save picker and writes the file on success', async () => {
    mockShowSaveFilePicker.mockResolvedValue({ createWritable: mockCreateWritable });

    await new WebBridge().fileExport(data, filename, filters);

    expect(mockShowSaveFilePicker).toHaveBeenCalledTimes(1);
    expect(mockWrite).toHaveBeenCalledWith(data);
    expect(mockClose).toHaveBeenCalledTimes(1);
    expect(mockAnchorClick).not.toHaveBeenCalled();
  });

  it('does not trigger a fallback download when the user cancels (AbortError)', async () => {
    const abortError = Object.assign(new Error('The user aborted a request.'), {
      name: 'AbortError',
    });
    mockShowSaveFilePicker.mockRejectedValue(abortError);

    await expect(new WebBridge().fileExport(data, filename, filters)).resolves.toBeUndefined();

    expect(mockShowSaveFilePicker).toHaveBeenCalledTimes(1);
    // Regression guard: cancelling the picker must NOT silently trigger a second download
    expect(mockAnchorClick).not.toHaveBeenCalled();
  });

  it('propagates non-abort errors without triggering a fallback download', async () => {
    mockShowSaveFilePicker.mockResolvedValue({ createWritable: mockCreateWritable });
    mockWrite.mockRejectedValue(new Error('Disk full'));

    await expect(new WebBridge().fileExport(data, filename, filters)).rejects.toThrow('Disk full');

    expect(mockAnchorClick).not.toHaveBeenCalled();
  });

  it('uses the anchor fallback when File System Access API is unavailable', async () => {
    // Temporarily remove showOpenFilePicker to simulate an unsupported browser
    const originalWindow = global.window;
    const { showOpenFilePicker: _omit, ...windowWithoutFSA } = originalWindow as Record<string, unknown>;
    Object.defineProperty(global, 'window', { value: windowWithoutFSA, writable: true });

    await new WebBridge().fileExport(data, filename, filters);

    expect(mockShowSaveFilePicker).not.toHaveBeenCalled();
    expect(mockAnchorClick).toHaveBeenCalledTimes(1);

    Object.defineProperty(global, 'window', { value: originalWindow, writable: true });
  });
});
