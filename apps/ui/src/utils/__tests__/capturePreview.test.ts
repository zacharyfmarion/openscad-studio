/** @jest-environment jsdom */

import { jest } from '@jest/globals';
import { captureCurrentPreview } from '../capturePreview';

describe('captureCurrentPreview', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    jest.restoreAllMocks();
  });

  it('prefers the scoped 3D preview canvas for the active viewer', async () => {
    const staleCanvas = document.createElement('canvas');
    staleCanvas.dataset.engine = 'stale';
    jest.spyOn(staleCanvas, 'toDataURL').mockReturnValue('data:image/png;base64,stale');
    document.body.appendChild(staleCanvas);

    const scopedRoot = document.createElement('div');
    scopedRoot.setAttribute('data-preview-root', 'viewer-2');
    const activeCanvas = document.createElement('canvas');
    activeCanvas.dataset.engine = 'active';
    jest.spyOn(activeCanvas, 'toDataURL').mockReturnValue('data:image/png;base64,active');
    scopedRoot.appendChild(activeCanvas);
    document.body.appendChild(scopedRoot);

    const result = await captureCurrentPreview({ viewerId: 'viewer-2' });

    expect(result).toBe('data:image/png;base64,active');
  });

  it('prefers the scoped SVG preview for the active viewer', async () => {
    document.body.innerHTML = `
      <div data-preview-root="viewer-1">
        <svg width="10" height="10" xmlns="http://www.w3.org/2000/svg">
          <g data-preview-svg><circle cx="5" cy="5" r="4" /></g>
        </svg>
      </div>
      <div data-preview-root="viewer-2">
        <svg width="10" height="10" xmlns="http://www.w3.org/2000/svg">
          <g data-preview-svg><rect width="10" height="10" /></g>
        </svg>
      </div>
    `;

    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: jest.fn(() => 'blob:scoped-preview'),
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: jest.fn(),
    });

    class MockImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      naturalWidth = 200;
      naturalHeight = 100;

      set src(_value: string) {
        this.onload?.();
      }
    }

    Object.defineProperty(globalThis, 'Image', {
      configurable: true,
      value: MockImage,
    });

    const drawImage = jest.fn();
    const fillRect = jest.fn();
    const toDataURL = jest.fn(() => 'data:image/png;base64,scoped-svg');
    const originalCreateElement = document.createElement.bind(document);
    jest.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
      if (tagName === 'canvas') {
        return {
          width: 0,
          height: 0,
          getContext: jest.fn(() => ({
            fillStyle: '',
            fillRect,
            drawImage,
          })),
          toDataURL,
        } as unknown as HTMLCanvasElement;
      }

      return originalCreateElement(tagName);
    });

    const result = await captureCurrentPreview({ viewerId: 'viewer-2' });

    expect(result).toBe('data:image/png;base64,scoped-svg');
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:scoped-preview');
  });
});
