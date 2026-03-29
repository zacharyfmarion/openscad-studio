/** @jest-environment jsdom */

import { jest } from '@jest/globals';
import {
  captureRenderedSvgElementImage,
  captureSvgPreviewImage,
  computeThumbnailFrame,
  expandSvgViewportForThumbnail,
} from '../captureSvgPreviewImage';

describe('captureSvgPreviewImage', () => {
  it('scales tiny SVG dimensions into a large centered social card frame', () => {
    const frame = computeThumbnailFrame(90, 54, 1200, 630, 72);

    expect(frame.width).toBeCloseTo(810);
    expect(frame.height).toBeCloseTo(486);
    expect(frame.x).toBeCloseTo(195);
    expect(frame.y).toBeCloseTo(72);
  });

  it('preserves aspect ratio for tall artwork', () => {
    const frame = computeThumbnailFrame(200, 600, 1200, 630, 72);

    expect(frame.width / frame.height).toBeCloseTo(200 / 600);
    expect(frame.height).toBeCloseTo(486);
    expect(frame.width).toBeCloseTo(162);
  });

  it('returns null when no svg source or svg markup is available', async () => {
    await expect(captureSvgPreviewImage()).resolves.toBeNull();
  });

  it('expands the source svg viewBox before rasterizing so strokes are less likely to clip', () => {
    const expanded = expandSvgViewportForThumbnail(
      '<svg viewBox="0 0 100 50" width="100" height="50"><rect width="100" height="50" /></svg>',
      0.05
    );

    expect(expanded).toContain('viewBox="-5 -5 110 60"');
    expect(expanded).toContain('width="110"');
    expect(expanded).toContain('height="60"');
  });

  it('preserves the rendered viewport size when rasterizing a live svg element', async () => {
    const originalCreateElement = document.createElement.bind(document);
    const drawImage = jest.fn();
    const fillRect = jest.fn();
    let createdCanvas: HTMLCanvasElement | null = null;

    class MockImage {
      naturalWidth = 320;
      naturalHeight = 180;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;

      set src(_value: string) {
        this.onload?.();
      }
    }

    Object.defineProperty(globalThis, 'Image', {
      configurable: true,
      value: MockImage,
    });
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: jest.fn(() => 'blob:mock-svg'),
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: jest.fn(),
    });

    jest.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
      const element = originalCreateElement(tagName);
      if (tagName === 'canvas') {
        createdCanvas = element as HTMLCanvasElement;
        Object.defineProperty(createdCanvas, 'getContext', {
          configurable: true,
          value: () => ({
            fillStyle: '#fff',
            fillRect,
            drawImage,
          }),
        });
        Object.defineProperty(createdCanvas, 'toDataURL', {
          configurable: true,
          value: () => 'data:image/png;base64,rendered',
        });
      }
      return element;
    });

    document.body.innerHTML =
      '<svg viewBox="0 0 40 20"><rect x="0" y="0" width="40" height="20" fill="#000" /></svg>';
    const svgElement = document.querySelector('svg') as SVGSVGElement;

    const result = await captureRenderedSvgElementImage({
      svgElement,
      targetWidth: 400,
      targetHeight: 300,
      backgroundColor: '#112233',
    });

    expect(result).toBe('data:image/png;base64,rendered');
    expect(createdCanvas?.width).toBe(400);
    expect(createdCanvas?.height).toBe(300);
    expect(fillRect).toHaveBeenCalledWith(0, 0, 400, 300);
    expect(drawImage).toHaveBeenCalled();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-svg');
  });
});
