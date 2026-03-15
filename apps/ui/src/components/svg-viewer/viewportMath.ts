import type { SvgBounds, SvgPoint, SvgViewportState } from './types';

export const MIN_VIEWER_SCALE = 0.1;
export const MAX_VIEWER_SCALE = 24;
export const FIT_PADDING_PX = 32;

export function clampScale(scale: number): number {
  if (!Number.isFinite(scale)) {
    return 1;
  }

  return Math.min(MAX_VIEWER_SCALE, Math.max(MIN_VIEWER_SCALE, scale));
}

export function sanitizeViewport(viewport: SvgViewportState): SvgViewportState {
  const scale = clampScale(viewport.scale);

  return {
    ...viewport,
    scale,
    translateX: Number.isFinite(viewport.translateX) ? viewport.translateX : 0,
    translateY: Number.isFinite(viewport.translateY) ? viewport.translateY : 0,
  };
}

export function fitViewportToBounds(
  bounds: SvgBounds,
  containerWidth: number,
  containerHeight: number,
  source: SvgViewportState['interactionSource'] = 'toolbar'
): SvgViewportState {
  const safeWidth = Math.max(containerWidth, 1);
  const safeHeight = Math.max(containerHeight, 1);
  const scale = clampScale(
    Math.min(
      (safeWidth - FIT_PADDING_PX * 2) / Math.max(bounds.width, 1),
      (safeHeight - FIT_PADDING_PX * 2) / Math.max(bounds.height, 1)
    )
  );

  const centerX = bounds.minX + bounds.width / 2;
  const centerY = bounds.minY + bounds.height / 2;

  return sanitizeViewport({
    scale,
    translateX: safeWidth / 2 - centerX * scale,
    translateY: safeHeight / 2 - centerY * scale,
    fitMode: 'fit',
    interactionSource: source,
  });
}

export function actualSizeViewport(
  bounds: SvgBounds,
  containerWidth: number,
  containerHeight: number,
  source: SvgViewportState['interactionSource'] = 'toolbar'
): SvgViewportState {
  const scale = 1;
  const centerX = bounds.minX + bounds.width / 2;
  const centerY = bounds.minY + bounds.height / 2;

  return sanitizeViewport({
    scale,
    translateX: containerWidth / 2 - centerX * scale,
    translateY: containerHeight / 2 - centerY * scale,
    fitMode: 'actual',
    interactionSource: source,
  });
}

export function getVisibleDocumentBounds(
  viewport: Pick<SvgViewportState, 'scale' | 'translateX' | 'translateY'>,
  containerWidth: number,
  containerHeight: number
): SvgBounds {
  const safeScale = clampScale(viewport.scale);
  return {
    minX: -viewport.translateX / safeScale,
    minY: -viewport.translateY / safeScale,
    width: containerWidth / safeScale,
    height: containerHeight / safeScale,
  };
}

export function clientToSvgPoint(
  clientX: number,
  clientY: number,
  rect: Pick<DOMRect, 'left' | 'top'>,
  viewport: Pick<SvgViewportState, 'scale' | 'translateX' | 'translateY'>
): SvgPoint {
  const safeScale = clampScale(viewport.scale);
  return {
    x: (clientX - rect.left - viewport.translateX) / safeScale,
    y: (clientY - rect.top - viewport.translateY) / safeScale,
  };
}

export function svgToClientPoint(
  point: SvgPoint,
  rect: Pick<DOMRect, 'left' | 'top'>,
  viewport: Pick<SvgViewportState, 'scale' | 'translateX' | 'translateY'>
): SvgPoint {
  const safeScale = clampScale(viewport.scale);
  return {
    x: rect.left + viewport.translateX + point.x * safeScale,
    y: rect.top + viewport.translateY + point.y * safeScale,
  };
}

export function zoomAroundClientPoint(
  viewport: SvgViewportState,
  nextScale: number,
  clientX: number,
  clientY: number,
  rect: Pick<DOMRect, 'left' | 'top'>
): SvgViewportState {
  const clampedScale = clampScale(nextScale);
  const point = clientToSvgPoint(clientX, clientY, rect, viewport);

  return sanitizeViewport({
    scale: clampedScale,
    translateX: clientX - rect.left - point.x * clampedScale,
    translateY: clientY - rect.top - point.y * clampedScale,
    fitMode: 'custom',
    interactionSource: 'wheel',
  });
}
