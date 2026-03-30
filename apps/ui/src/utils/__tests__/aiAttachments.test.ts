/** @jest-environment jsdom */

import {
  getAttachmentDedupeKey,
  getDraftCanSubmit,
  getDraftNormalizedSizeBytes,
  getFileValidationError,
  processAttachmentFiles,
  getReadyAttachmentIds,
} from '../aiAttachments';
import type { AiDraft, AttachmentStore } from '../../types/aiChat';
import { jest } from '@jest/globals';

describe('aiAttachments', () => {
  const draft: AiDraft = {
    text: '',
    attachmentIds: ['ready-1', 'error-1'],
  };

  const attachments: AttachmentStore = {
    'ready-1': {
      id: 'ready-1',
      filename: 'lamp.png',
      sourceMimeType: 'image/png',
      normalizedMimeType: 'image/png',
      sizeBytes: 1024,
      status: 'ready',
      dedupeKey: 'lamp.png:1024:1',
    },
    'error-1': {
      id: 'error-1',
      filename: 'bad.gif',
      sourceMimeType: 'image/gif',
      sizeBytes: 2048,
      status: 'error',
      errorMessage: 'bad.gif: GIF images are not supported.',
      dedupeKey: 'bad.gif:2048:2',
    },
  };

  it('builds stable dedupe keys', () => {
    expect(
      getAttachmentDedupeKey({
        name: 'image.png',
        size: 123,
        lastModified: 456,
      })
    ).toBe('image.png:123:456');
  });

  it('returns ready attachment ids in draft order', () => {
    expect(getReadyAttachmentIds(draft, attachments)).toEqual(['ready-1']);
  });

  it('allows submit when a draft has ready attachments', () => {
    expect(getDraftCanSubmit(draft, attachments)).toBe(true);
    expect(getDraftNormalizedSizeBytes(draft, attachments)).toBe(1024);
  });

  it('rejects unsupported image types and oversized files', () => {
    expect(
      getFileValidationError({
        name: 'vector.svg',
        type: 'image/svg+xml',
        size: 100,
      })
    ).toContain('SVG images are not supported');

    expect(
      getFileValidationError({
        name: 'huge.png',
        type: 'image/png',
        size: 9 * 1024 * 1024,
      })
    ).toContain('8 MB limit');
  });

  it('accepts supported file types under the size cap', () => {
    expect(
      getFileValidationError({
        name: 'model.webp',
        type: 'image/webp',
        size: 1024,
      })
    ).toBeNull();
  });

  it('preserves the attachment source surface when normalizing viewer annotations', async () => {
    const originalCreateElement = document.createElement.bind(document);
    const originalCreateImageBitmap = globalThis.createImageBitmap;
    const originalFileReader = globalThis.FileReader;
    const originalCreateObjectURL = globalThis.URL.createObjectURL;
    const mockBitmap = {
      width: 120,
      height: 80,
      close: jest.fn(),
    };
    const mockContext = {
      drawImage: jest.fn(),
      getImageData: jest.fn(() => ({
        data: new Uint8ClampedArray([0, 0, 0, 255]),
      })),
    };
    globalThis.createImageBitmap = jest.fn().mockResolvedValue(mockBitmap as ImageBitmap);
    globalThis.FileReader = class MockFileReader {
      result = 'data:image/png;base64,ZmFrZQ==';
      error: DOMException | null = null;
      onload: ((this: FileReader, ev: ProgressEvent<FileReader>) => unknown) | null = null;
      onerror: ((this: FileReader, ev: ProgressEvent<FileReader>) => unknown) | null = null;

      readAsDataURL(blob: Blob) {
        void blob;
        this.onload?.call(this as unknown as FileReader, new ProgressEvent('load'));
      }
    } as typeof FileReader;
    globalThis.URL.createObjectURL = jest.fn(() => 'blob:annotated-preview');
    const createElementSpy = jest.spyOn(document, 'createElement').mockImplementation(((
      tagName: string
    ) => {
      if (tagName === 'canvas') {
        return {
          width: 0,
          height: 0,
          getContext: jest.fn(() => mockContext),
          toBlob: jest.fn((callback: BlobCallback, type?: string) => {
            callback?.(new Blob(['image'], { type: type ?? 'image/png' }));
          }),
        } as unknown as HTMLCanvasElement;
      }

      return originalCreateElement(tagName);
    }) as typeof document.createElement);

    try {
      const file = new File(['annotation'], 'annotated.png', {
        type: 'image/png',
        lastModified: 1,
      });

      const result = await processAttachmentFiles(
        [file],
        { text: '', attachmentIds: [] },
        {},
        'viewer_annotation'
      );

      expect(result.errors).toEqual([]);
      expect(result.attachments).toHaveLength(1);
      expect(result.attachments[0]).toMatchObject({
        filename: 'annotated.png',
        sourceSurface: 'viewer_annotation',
        status: 'ready',
      });
      expect(mockBitmap.close).toHaveBeenCalled();
    } finally {
      globalThis.createImageBitmap = originalCreateImageBitmap;
      globalThis.FileReader = originalFileReader;
      globalThis.URL.createObjectURL = originalCreateObjectURL;
      createElementSpy.mockRestore();
    }
  });
});
