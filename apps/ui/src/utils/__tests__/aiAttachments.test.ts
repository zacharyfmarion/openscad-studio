import {
  getAttachmentDedupeKey,
  getDraftCanSubmit,
  getDraftNormalizedSizeBytes,
  getFileValidationError,
  getReadyAttachmentIds,
} from '../aiAttachments';
import type { AiDraft, AttachmentStore } from '../../types/aiChat';

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
});
