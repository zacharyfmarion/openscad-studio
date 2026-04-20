import { jest } from '@jest/globals';

const mockShowSaveFilePicker = jest.fn();
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
    mockCreateObjectURL.mockReturnValue('blob:mock-url');
  });

  it('uses the browser download flow even when File System Access API is available', async () => {
    await new WebBridge().fileExport(data, filename, filters);

    expect(mockShowSaveFilePicker).not.toHaveBeenCalled();
    expect(mockAnchorClick).toHaveBeenCalledTimes(1);
    expect(mockAppendChild).toHaveBeenCalledTimes(1);
    expect(mockRemoveChild).toHaveBeenCalledTimes(1);
    expect(mockRevokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
  });

  it('uses the same browser download flow when File System Access API is unavailable', async () => {
    // Temporarily remove showOpenFilePicker to simulate an unsupported browser
    const originalWindow = global.window;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { showOpenFilePicker: _omit, ...windowWithoutFSA } = originalWindow as Record<
      string,
      unknown
    >;
    Object.defineProperty(global, 'window', { value: windowWithoutFSA, writable: true });

    await new WebBridge().fileExport(data, filename, filters);

    expect(mockAnchorClick).toHaveBeenCalledTimes(1);

    Object.defineProperty(global, 'window', { value: originalWindow, writable: true });
  });
});
