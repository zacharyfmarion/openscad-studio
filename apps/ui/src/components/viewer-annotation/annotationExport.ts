import type Konva from 'konva';
import { canvasToBlob, loadImageFromDataUrl } from '../../utils/imageData';
import { getExportScale } from './annotationGeometry';
import type { ViewerSurfaceSize } from './types';

export const MAX_ANNOTATION_EXPORT_EDGE = 1600;

export async function exportAnnotationOverlayDataUrl(args: {
  stage: Konva.Stage;
  surface: ViewerSurfaceSize;
  pixelRatio?: number;
}) {
  const exportScale = getExportScale(
    args.surface,
    MAX_ANNOTATION_EXPORT_EDGE,
    args.pixelRatio ?? 1
  );

  return {
    dataUrl: args.stage.toDataURL({
      pixelRatio: exportScale,
      mimeType: 'image/png',
    }),
    scale: exportScale,
    width: Math.max(1, Math.round(args.surface.width * exportScale)),
    height: Math.max(1, Math.round(args.surface.height * exportScale)),
  };
}

export async function composeAnnotatedImage(args: {
  baseImageDataUrl: string;
  overlayImageDataUrl: string;
  width: number;
  height: number;
  backgroundColor: string;
}) {
  const [baseImage, overlayImage] = await Promise.all([
    loadImageFromDataUrl(args.baseImageDataUrl),
    loadImageFromDataUrl(args.overlayImageDataUrl),
  ]);

  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, args.width);
  canvas.height = Math.max(1, args.height);
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    throw new Error('Could not create an export canvas.');
  }

  ctx.fillStyle = args.backgroundColor;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(baseImage, 0, 0, canvas.width, canvas.height);
  ctx.drawImage(overlayImage, 0, 0, canvas.width, canvas.height);

  return canvas.toDataURL('image/png');
}

export async function createAnnotationAttachmentFile(dataUrl: string, fileName: string) {
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  return new File([blob], fileName, { type: 'image/png', lastModified: Date.now() });
}

export async function rasterizeCanvasDataUrlToBlob(dataUrl: string) {
  const image = await loadImageFromDataUrl(dataUrl);
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth || 1;
  canvas.height = image.naturalHeight || 1;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Could not create a canvas while finalizing the annotated image.');
  }

  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvasToBlob(canvas, 'image/png');
}
