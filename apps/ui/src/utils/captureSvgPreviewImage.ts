const DEFAULT_TARGET_WIDTH = 1200;
const DEFAULT_TARGET_HEIGHT = 630;
const DEFAULT_PADDING = 72;
const DEFAULT_BACKGROUND = '#ffffff';
const DEFAULT_SOURCE_MARGIN_RATIO = 0.05;

export interface SvgPreviewImageOptions {
  svgSourceUrl?: string | null;
  svgMarkup?: string | null;
  targetWidth?: number;
  targetHeight?: number;
  padding?: number;
  backgroundColor?: string;
  sourceMarginRatio?: number;
}

export interface ThumbnailFrame {
  x: number;
  y: number;
  width: number;
  height: number;
}

function parseNumericLength(value: string | null): number | null {
  if (!value) {
    return null;
  }

  const match = value.trim().match(/^(-?\d+(?:\.\d+)?)/);
  if (!match) {
    return null;
  }

  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : null;
}

function replaceOrAppendAttribute(tag: string, name: string, value: string): string {
  const pattern = new RegExp(`\\s${name}=(["']).*?\\1`, 'i');
  if (pattern.test(tag)) {
    return tag.replace(pattern, ` ${name}="${value}"`);
  }

  return tag.replace(/>$/, ` ${name}="${value}">`);
}

export function expandSvgViewportForThumbnail(
  svgMarkup: string,
  marginRatio: number = DEFAULT_SOURCE_MARGIN_RATIO
): string {
  const svgTagMatch = svgMarkup.match(/<svg\b[^>]*>/i);
  if (!svgTagMatch) {
    return svgMarkup;
  }

  const svgTag = svgTagMatch[0];
  const viewBoxMatch = svgTag.match(/\sviewBox=(["'])(.*?)\1/i);
  const widthMatch = svgTag.match(/\swidth=(["'])(.*?)\1/i);
  const heightMatch = svgTag.match(/\sheight=(["'])(.*?)\1/i);

  let minX = 0;
  let minY = 0;
  let width: number | null = null;
  let height: number | null = null;

  if (viewBoxMatch) {
    const parts = viewBoxMatch[2]
      .trim()
      .split(/[\s,]+/)
      .map((part) => Number(part));

    if (parts.length === 4 && parts.every((part) => Number.isFinite(part))) {
      [minX, minY, width, height] = parts;
    }
  }

  if (!(width && height && width > 0 && height > 0)) {
    width = parseNumericLength(widthMatch?.[2] ?? null);
    height = parseNumericLength(heightMatch?.[2] ?? null);
    minX = 0;
    minY = 0;
  }

  if (!(width && height && width > 0 && height > 0)) {
    return svgMarkup;
  }

  const safeMarginRatio =
    Number.isFinite(marginRatio) && marginRatio >= 0 ? marginRatio : DEFAULT_SOURCE_MARGIN_RATIO;
  const margin = Math.max(width, height) * safeMarginRatio;
  const expandedMinX = minX - margin;
  const expandedMinY = minY - margin;
  const expandedWidth = width + margin * 2;
  const expandedHeight = height + margin * 2;

  let nextTag = replaceOrAppendAttribute(
    svgTag,
    'viewBox',
    `${expandedMinX} ${expandedMinY} ${expandedWidth} ${expandedHeight}`
  );
  nextTag = replaceOrAppendAttribute(nextTag, 'width', String(expandedWidth));
  nextTag = replaceOrAppendAttribute(nextTag, 'height', String(expandedHeight));

  return svgMarkup.replace(svgTag, nextTag);
}

export function computeThumbnailFrame(
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number = DEFAULT_TARGET_WIDTH,
  targetHeight: number = DEFAULT_TARGET_HEIGHT,
  padding: number = DEFAULT_PADDING
): ThumbnailFrame {
  const safeSourceWidth = Number.isFinite(sourceWidth) && sourceWidth > 0 ? sourceWidth : 1;
  const safeSourceHeight = Number.isFinite(sourceHeight) && sourceHeight > 0 ? sourceHeight : 1;
  const safeTargetWidth = Number.isFinite(targetWidth) && targetWidth > 0 ? targetWidth : 1;
  const safeTargetHeight = Number.isFinite(targetHeight) && targetHeight > 0 ? targetHeight : 1;
  const safePadding = Number.isFinite(padding) && padding >= 0 ? padding : 0;

  const availableWidth = Math.max(safeTargetWidth - safePadding * 2, 1);
  const availableHeight = Math.max(safeTargetHeight - safePadding * 2, 1);
  const scale = Math.min(availableWidth / safeSourceWidth, availableHeight / safeSourceHeight);
  const width = safeSourceWidth * scale;
  const height = safeSourceHeight * scale;

  return {
    x: (safeTargetWidth - width) / 2,
    y: (safeTargetHeight - height) / 2,
    width,
    height,
  };
}

async function readSvgMarkup(options: SvgPreviewImageOptions): Promise<string | null> {
  if (options.svgMarkup?.trim()) {
    return options.svgMarkup;
  }

  if (options.svgSourceUrl) {
    const response = await fetch(options.svgSourceUrl);
    const contentType = response.headers.get('content-type');
    if (!response.ok) {
      throw new Error(`Failed to fetch SVG preview: ${response.statusText}`);
    }
    if (contentType && !contentType.includes('svg') && !contentType.includes('xml')) {
      throw new Error('Preview response was not an SVG document.');
    }
    return await response.text();
  }

  if (typeof document === 'undefined') {
    return null;
  }

  const svgElement = document.querySelector('[data-preview-svg] svg') as SVGSVGElement | null;
  if (!svgElement) {
    return null;
  }

  return new XMLSerializer().serializeToString(svgElement);
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Failed to load SVG image'));
    image.src = url;
  });
}

export async function captureSvgPreviewImage(
  options: SvgPreviewImageOptions = {}
): Promise<string | null> {
  const svgMarkup = await readSvgMarkup(options);
  if (!svgMarkup) {
    return null;
  }

  const targetWidth = options.targetWidth ?? DEFAULT_TARGET_WIDTH;
  const targetHeight = options.targetHeight ?? DEFAULT_TARGET_HEIGHT;
  const padding = options.padding ?? DEFAULT_PADDING;
  const backgroundColor = options.backgroundColor ?? DEFAULT_BACKGROUND;
  const sourceMarginRatio = options.sourceMarginRatio ?? DEFAULT_SOURCE_MARGIN_RATIO;
  const framedSvgMarkup = expandSvgViewportForThumbnail(svgMarkup, sourceMarginRatio);

  const svgBlob = new Blob([framedSvgMarkup], { type: 'image/svg+xml;charset=utf-8' });
  const objectUrl = URL.createObjectURL(svgBlob);

  try {
    const image = await loadImage(objectUrl);
    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Could not get 2d context');
    }

    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, targetWidth, targetHeight);

    const frame = computeThumbnailFrame(
      image.naturalWidth || targetWidth,
      image.naturalHeight || targetHeight,
      targetWidth,
      targetHeight,
      padding
    );
    ctx.drawImage(image, frame.x, frame.y, frame.width, frame.height);

    return canvas.toDataURL('image/png');
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
