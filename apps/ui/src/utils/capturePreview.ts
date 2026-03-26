import { captureSvgPreviewImage, type SvgPreviewImageOptions } from './captureSvgPreviewImage';

export type CaptureCurrentPreviewOptions = Pick<
  SvgPreviewImageOptions,
  'svgSourceUrl' | 'targetWidth' | 'targetHeight'
>;

export async function captureCurrentPreview(
  options: CaptureCurrentPreviewOptions = {}
): Promise<string | null> {
  const canvas = document.querySelector('canvas[data-engine]') as HTMLCanvasElement | null;
  if (canvas) {
    try {
      return canvas.toDataURL('image/png');
    } catch (error) {
      if (import.meta.env.DEV) {
        console.warn('[capturePreview] Failed to capture 3D canvas:', error);
      }
    }
  }

  try {
    return await captureSvgPreviewImage({
      svgSourceUrl: options.svgSourceUrl,
      targetWidth: options.targetWidth,
      targetHeight: options.targetHeight,
    });
  } catch (error) {
    if (import.meta.env.DEV) {
      console.warn('[capturePreview] Failed to capture SVG preview:', error);
    }
  }

  return null;
}
