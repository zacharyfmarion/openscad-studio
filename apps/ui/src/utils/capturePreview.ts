import { captureSvgPreviewImage, type SvgPreviewImageOptions } from './captureSvgPreviewImage';

export type CaptureCurrentPreviewOptions = Pick<
  SvgPreviewImageOptions,
  'svgSourceUrl' | 'targetWidth' | 'targetHeight'
> & {
  viewerId?: string | null;
};

function getPreviewRoot(viewerId?: string | null): ParentNode | null {
  if (typeof document === 'undefined' || !viewerId) {
    return null;
  }

  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
    return document.querySelector(`[data-preview-root="${CSS.escape(viewerId)}"]`);
  }

  return document.querySelector(`[data-preview-root="${viewerId.replace(/"/g, '\\"')}"]`);
}

export async function captureCurrentPreview(
  options: CaptureCurrentPreviewOptions = {}
): Promise<string | null> {
  const previewRoot = getPreviewRoot(options.viewerId);
  const canvas = (previewRoot?.querySelector('canvas[data-engine]') ??
    document.querySelector('canvas[data-engine]')) as HTMLCanvasElement | null;
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
    const svgElement =
      (previewRoot?.querySelector('[data-preview-svg]')?.closest('svg') as SVGSVGElement | null) ??
      null;

    return await captureSvgPreviewImage({
      svgSourceUrl: options.svgSourceUrl,
      svgElement,
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
