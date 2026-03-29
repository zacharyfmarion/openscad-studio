import type { ModelSelectionSurface } from '../analytics/runtime';
import type { AiDraft, AttachmentRecord, AttachmentStore } from '../types/aiChat';
import { createRandomId } from './randomId';

export const MAX_ATTACHMENTS_PER_MESSAGE = 4;
export const MAX_SOURCE_FILE_BYTES = 8 * 1024 * 1024;
export const MAX_NORMALIZED_IMAGE_BYTES = 1.5 * 1024 * 1024;
export const MAX_TOTAL_NORMALIZED_BYTES = 4 * 1024 * 1024;
export const MAX_IMAGE_EDGE = 1600;
const PREVIEW_EDGE = 256;
const JPEG_QUALITY = 0.82;
const PREVIEW_JPEG_QUALITY = 0.72;

const ALLOWED_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);

const REJECTED_MIME_MESSAGES: Record<string, string> = {
  'image/svg+xml': 'SVG images are not supported.',
  'image/gif': 'GIF images are not supported.',
  'image/heic': 'HEIC images are not supported.',
  'image/heif': 'HEIF images are not supported.',
  'image/tiff': 'TIFF images are not supported.',
};

export interface AttachmentBatchResult {
  attachments: AttachmentRecord[];
  errors: string[];
}

export function getAttachmentDedupeKey(file: Pick<File, 'name' | 'size' | 'lastModified'>): string {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

export function getExistingDraftDedupeKeys(
  draft: AiDraft,
  attachments: AttachmentStore
): Set<string> {
  return new Set(
    draft.attachmentIds
      .map((id) => attachments[id]?.dedupeKey)
      .filter((dedupeKey): dedupeKey is string => Boolean(dedupeKey))
  );
}

export function getReadyAttachmentIds(draft: AiDraft, attachments: AttachmentStore): string[] {
  return draft.attachmentIds.filter((id) => attachments[id]?.status === 'ready');
}

export function getDraftHasPendingAttachments(
  draft: AiDraft,
  attachments: AttachmentStore
): boolean {
  return draft.attachmentIds.some((id) => attachments[id]?.status === 'pending');
}

export function getDraftCanSubmit(draft: AiDraft, attachments: AttachmentStore): boolean {
  return draft.text.trim().length > 0 || getReadyAttachmentIds(draft, attachments).length > 0;
}

export function getDraftNormalizedSizeBytes(draft: AiDraft, attachments: AttachmentStore): number {
  return draft.attachmentIds.reduce((total, id) => {
    const attachment = attachments[id];
    if (!attachment || attachment.status !== 'ready') return total;
    return total + attachment.sizeBytes;
  }, 0);
}

export function getFileValidationError(file: Pick<File, 'type' | 'size' | 'name'>): string | null {
  if (!file.type.startsWith('image/')) {
    return `${file.name}: only PNG, JPEG, and WebP images are supported.`;
  }

  if (REJECTED_MIME_MESSAGES[file.type]) {
    return `${file.name}: ${REJECTED_MIME_MESSAGES[file.type]}`;
  }

  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    return `${file.name}: only PNG, JPEG, and WebP images are supported.`;
  }

  if (file.size > MAX_SOURCE_FILE_BYTES) {
    return `${file.name}: source image exceeds the 8 MB limit.`;
  }

  return null;
}

export async function processAttachmentFiles(
  files: File[],
  draft: AiDraft,
  attachments: AttachmentStore,
  sourceSurface: ModelSelectionSurface = 'unknown'
): Promise<AttachmentBatchResult> {
  const existingKeys = getExistingDraftDedupeKeys(draft, attachments);
  const queuedKeys = new Set<string>();
  const nextAttachments: AttachmentRecord[] = [];
  const errors: string[] = [];
  let remainingSlots = Math.max(
    0,
    MAX_ATTACHMENTS_PER_MESSAGE -
      draft.attachmentIds.filter((id) => attachments[id]?.status !== 'error').length
  );
  let totalBytes = getDraftNormalizedSizeBytes(draft, attachments);

  for (const file of files) {
    const dedupeKey = getAttachmentDedupeKey(file);

    if (existingKeys.has(dedupeKey) || queuedKeys.has(dedupeKey)) {
      continue;
    }

    if (remainingSlots <= 0) {
      errors.push(`Only ${MAX_ATTACHMENTS_PER_MESSAGE} images can be attached per message.`);
      continue;
    }

    queuedKeys.add(dedupeKey);

    const validationError = getFileValidationError(file);
    if (validationError) {
      nextAttachments.push(buildErrorAttachment(file, dedupeKey, validationError, sourceSurface));
      continue;
    }

    try {
      const normalized = await normalizeImageFile(file, dedupeKey, sourceSurface);

      if (normalized.sizeBytes > MAX_NORMALIZED_IMAGE_BYTES) {
        nextAttachments.push(
          buildErrorAttachment(
            file,
            dedupeKey,
            `${file.name}: normalized image exceeds the 1.5 MB limit.`,
            sourceSurface
          )
        );
      } else if (totalBytes + normalized.sizeBytes > MAX_TOTAL_NORMALIZED_BYTES) {
        nextAttachments.push(
          buildErrorAttachment(
            file,
            dedupeKey,
            `${file.name}: adding this image would exceed the 4 MB per-message limit.`,
            sourceSurface
          )
        );
      } else {
        nextAttachments.push(normalized);
        totalBytes += normalized.sizeBytes;
      }
    } catch (error) {
      nextAttachments.push(
        buildErrorAttachment(
          file,
          dedupeKey,
          `${file.name}: ${error instanceof Error ? error.message : 'failed to process image.'}`,
          sourceSurface
        )
      );
    }

    if (nextAttachments[nextAttachments.length - 1]?.status === 'ready') {
      remainingSlots -= 1;
    }
  }

  return { attachments: nextAttachments, errors: [...new Set(errors)] };
}

function buildErrorAttachment(
  file: Pick<File, 'name' | 'type' | 'size'>,
  dedupeKey: string,
  errorMessage: string,
  sourceSurface: ModelSelectionSurface
): AttachmentRecord {
  return {
    id: createRandomId(),
    filename: file.name,
    sourceSurface,
    sourceMimeType: file.type,
    sizeBytes: file.size,
    status: 'error',
    errorMessage,
    dedupeKey,
  };
}

async function normalizeImageFile(
  file: File,
  dedupeKey: string,
  sourceSurface: ModelSelectionSurface
): Promise<AttachmentRecord> {
  const bitmap = await createImageBitmap(file);

  try {
    const { width, height } = getScaledDimensions(bitmap.width, bitmap.height, MAX_IMAGE_EDGE);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      throw new Error('could not create a 2D drawing context.');
    }

    ctx.drawImage(bitmap, 0, 0, width, height);

    const hasAlpha = imageHasTransparency(ctx, width, height);
    const normalizedMimeType = hasAlpha ? 'image/png' : 'image/jpeg';
    const normalizedBlob = await canvasToBlob(
      canvas,
      normalizedMimeType,
      normalizedMimeType === 'image/jpeg' ? JPEG_QUALITY : undefined
    );
    const previewBlob = await createPreviewBlob(canvas, hasAlpha);

    return {
      id: createRandomId(),
      filename: file.name,
      sourceSurface,
      sourceMimeType: file.type,
      normalizedMimeType,
      sizeBytes: normalizedBlob.size,
      width,
      height,
      previewUrl: URL.createObjectURL(previewBlob),
      normalizedData: await blobToBase64(normalizedBlob),
      status: 'ready',
      dedupeKey,
    };
  } finally {
    bitmap.close();
  }
}

function getScaledDimensions(width: number, height: number, maxEdge: number) {
  const longestEdge = Math.max(width, height);
  if (longestEdge <= maxEdge) {
    return { width, height };
  }

  const scale = maxEdge / longestEdge;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function imageHasTransparency(ctx: CanvasRenderingContext2D, width: number, height: number) {
  const { data } = ctx.getImageData(0, 0, width, height);
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] < 255) {
      return true;
    }
  }
  return false;
}

async function createPreviewBlob(canvas: HTMLCanvasElement, hasAlpha: boolean): Promise<Blob> {
  const { width, height } = getScaledDimensions(canvas.width, canvas.height, PREVIEW_EDGE);
  const previewCanvas = document.createElement('canvas');
  previewCanvas.width = width;
  previewCanvas.height = height;
  const previewCtx = previewCanvas.getContext('2d');

  if (!previewCtx) {
    throw new Error('could not create a preview canvas.');
  }

  previewCtx.drawImage(canvas, 0, 0, width, height);

  const mimeType = hasAlpha ? 'image/png' : 'image/jpeg';
  return canvasToBlob(previewCanvas, mimeType, hasAlpha ? undefined : PREVIEW_JPEG_QUALITY);
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('failed to encode image.'));
          return;
        }
        resolve(blob);
      },
      type,
      quality
    );
  });
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      const base64 = result.split(',')[1];
      if (!base64) {
        reject(new Error('failed to read normalized image data.'));
        return;
      }
      resolve(base64);
    };
    reader.onerror = () => reject(reader.error ?? new Error('failed to read image data.'));
    reader.readAsDataURL(blob);
  });
}
