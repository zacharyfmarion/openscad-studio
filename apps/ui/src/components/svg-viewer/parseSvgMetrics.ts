import type { ParsedSvgDocument, SvgBounds } from './types';

const GEOMETRY_SELECTOR = 'path, circle, ellipse, rect, polygon, polyline, line, text, use';
const PREVIEW_STROKE_WIDTH_SCALE = 1.15;
const OPENSCAD_DEFAULT_FILL_VALUES = new Set([
  'lightgray',
  'lightgrey',
  '#d3d3d3',
  'rgb(211,211,211)',
  'rgba(211,211,211,1)',
]);
const OPENSCAD_DEFAULT_STROKE_VALUES = new Set([
  'black',
  '#000',
  '#000000',
  'rgb(0,0,0)',
  'rgba(0,0,0,1)',
]);
const FILL_CAPABLE_GEOMETRY_TAGS = new Set([
  'path',
  'circle',
  'ellipse',
  'rect',
  'polygon',
  'text',
  'use',
]);

interface ParseSvgMetricsOptions {
  defaultFillColor?: string;
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

function scaleStrokeWidth(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const match = value.trim().match(/^(-?\d+(?:\.\d+)?)(.*)$/);
  if (!match) {
    return null;
  }

  const numericValue = Number(match[1]);
  if (!Number.isFinite(numericValue)) {
    return null;
  }

  const suffix = match[2] ?? '';
  return `${Number((numericValue * PREVIEW_STROKE_WIDTH_SCALE).toFixed(2))}${suffix}`;
}

function normalizeColorToken(value: string | null): string | null {
  if (!value) {
    return null;
  }

  return value.replace(/\s+/g, '').toLowerCase();
}

function styleContainsExplicitNonDefaultFill(styleValue: string | null) {
  if (!styleValue) {
    return false;
  }

  const fillDeclaration = styleValue
    .split(';')
    .map((declaration) => declaration.trim())
    .find((declaration) => declaration.toLowerCase().startsWith('fill:'));

  if (!fillDeclaration) {
    return false;
  }

  const fillValue = normalizeColorToken(fillDeclaration.slice(fillDeclaration.indexOf(':') + 1));
  return !!fillValue && fillValue !== 'none' && !OPENSCAD_DEFAULT_FILL_VALUES.has(fillValue);
}

function getStyleDeclaration(styleValue: string | null, propertyName: string): string | null {
  if (!styleValue) {
    return null;
  }

  const propertyNameLower = propertyName.toLowerCase();
  const declaration = styleValue
    .split(';')
    .map((entry) => entry.trim())
    .find((entry) => entry.toLowerCase().startsWith(`${propertyNameLower}:`));

  if (!declaration) {
    return null;
  }

  return declaration.slice(declaration.indexOf(':') + 1).trim();
}

function hasOpenScadDefaultOutlineOnlyStyle(geometryElement: Element) {
  if (!FILL_CAPABLE_GEOMETRY_TAGS.has(geometryElement.tagName.toLowerCase())) {
    return false;
  }

  const styleValue = geometryElement.getAttribute('style');
  const fillValue = normalizeColorToken(
    geometryElement.getAttribute('fill') ?? getStyleDeclaration(styleValue, 'fill')
  );
  if (fillValue !== 'none') {
    return false;
  }

  const strokeValue = normalizeColorToken(
    geometryElement.getAttribute('stroke') ?? getStyleDeclaration(styleValue, 'stroke')
  );
  return !!strokeValue && OPENSCAD_DEFAULT_STROKE_VALUES.has(strokeValue);
}

function shouldApplyDefaultFill(
  geometryElement: Element,
  defaultFillColor: string | undefined
): defaultFillColor is string {
  if (!defaultFillColor) {
    return false;
  }

  if (styleContainsExplicitNonDefaultFill(geometryElement.getAttribute('style'))) {
    return false;
  }

  const fillValue = normalizeColorToken(geometryElement.getAttribute('fill'));
  if (!fillValue) {
    return true;
  }

  if (fillValue === 'none') {
    return hasOpenScadDefaultOutlineOnlyStyle(geometryElement);
  }

  return OPENSCAD_DEFAULT_FILL_VALUES.has(fillValue);
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

export function parseSvgMetrics(
  svgText: string,
  options: ParseSvgMetricsOptions = {}
): ParsedSvgDocument {
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

  const geometryElements = [...svgElement.querySelectorAll(GEOMETRY_SELECTOR)];
  const hasGeometry = geometryElements.length > 0;
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

  for (const geometryElement of geometryElements) {
    if (shouldApplyDefaultFill(geometryElement, options.defaultFillColor)) {
      geometryElement.setAttribute('fill', options.defaultFillColor);
    }

    if (!geometryElement.hasAttribute('vector-effect')) {
      geometryElement.setAttribute('vector-effect', 'non-scaling-stroke');
    }

    const scaledStrokeWidth = scaleStrokeWidth(geometryElement.getAttribute('stroke-width'));
    geometryElement.setAttribute('stroke-width', scaledStrokeWidth ?? '1.15');
  }

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
