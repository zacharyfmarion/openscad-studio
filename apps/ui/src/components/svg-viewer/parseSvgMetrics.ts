import type { ParsedSvgDocument, SvgBounds } from './types';

const NON_SCALING_STROKE_STYLE = `
  :where(path, circle, ellipse, rect, polygon, polyline, line, text, use) {
    vector-effect: non-scaling-stroke;
  }
`;

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

function isValidBounds(bounds: SvgBounds | null): bounds is SvgBounds {
  return !!bounds && bounds.width > 0 && bounds.height > 0;
}

function parseViewBox(value: string | null): SvgBounds | null {
  if (!value) {
    return null;
  }

  const parts = value
    .trim()
    .split(/[\s,]+/)
    .map((part) => Number(part));

  if (parts.length !== 4 || parts.some((part) => !Number.isFinite(part))) {
    return null;
  }

  const [minX, minY, width, height] = parts;
  if (width <= 0 || height <= 0) {
    return null;
  }

  return { minX, minY, width, height };
}

export function parseSvgMetrics(svgText: string): ParsedSvgDocument {
  const parser = new DOMParser();
  const document = parser.parseFromString(svgText, 'image/svg+xml');
  const parserError = document.querySelector('parsererror');
  if (parserError) {
    throw new Error('Could not parse SVG preview.');
  }

  const svgElement = document.documentElement;
  if (!svgElement || svgElement.tagName.toLowerCase() !== 'svg') {
    throw new Error('SVG preview is missing a root <svg> element.');
  }

  const warnings: string[] = [];
  const parsedViewBox = parseViewBox(svgElement.getAttribute('viewBox'));
  const intrinsicWidth = parseNumericLength(svgElement.getAttribute('width'));
  const intrinsicHeight = parseNumericLength(svgElement.getAttribute('height'));

  let viewBox = parsedViewBox;
  if (!viewBox && intrinsicWidth && intrinsicHeight && intrinsicWidth > 0 && intrinsicHeight > 0) {
    viewBox = {
      minX: 0,
      minY: 0,
      width: intrinsicWidth,
      height: intrinsicHeight,
    };
    warnings.push('SVG preview did not include a valid viewBox; falling back to width/height.');
  }

  if (!viewBox) {
    viewBox = {
      minX: 0,
      minY: 0,
      width: 100,
      height: 100,
    };
    warnings.push('SVG preview did not include a valid size; using a synthetic 100x100 viewBox.');
  }

  const hasGeometry = !!svgElement.querySelector(
    'path, circle, ellipse, rect, polygon, polyline, line, text, use'
  );
  const isEmpty = !hasGeometry;

  if (isEmpty) {
    warnings.push('SVG preview contains no drawable geometry.');
  }

  svgElement.setAttribute('width', '100%');
  svgElement.setAttribute('height', '100%');
  if (!svgElement.getAttribute('preserveAspectRatio')) {
    svgElement.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  }
  svgElement.setAttribute('width', String(viewBox.width));
  svgElement.setAttribute('height', String(viewBox.height));
  svgElement.setAttribute('x', String(viewBox.minX));
  svgElement.setAttribute('y', String(viewBox.minY));
  svgElement.setAttribute('overflow', 'visible');

  const nonScalingStrokeStyle = document.createElementNS('http://www.w3.org/2000/svg', 'style');
  nonScalingStrokeStyle.setAttribute('data-viewer-stroke-normalization', 'true');
  nonScalingStrokeStyle.textContent = NON_SCALING_STROKE_STYLE;
  svgElement.insertBefore(nonScalingStrokeStyle, svgElement.firstChild);

  const contentBounds = isValidBounds(viewBox)
    ? viewBox
    : {
        minX: 0,
        minY: 0,
        width: 100,
        height: 100,
      };

  return {
    markup: new XMLSerializer().serializeToString(svgElement),
    metrics: {
      viewBox,
      normalizedViewBox: {
        minX: 0,
        minY: 0,
        width: viewBox.width,
        height: viewBox.height,
      },
      documentOrigin: {
        x: viewBox.minX,
        y: viewBox.minY,
      },
      intrinsicWidth,
      intrinsicHeight,
      contentBounds,
      hasGeometry,
      isEmpty,
      warnings,
    },
  };
}
