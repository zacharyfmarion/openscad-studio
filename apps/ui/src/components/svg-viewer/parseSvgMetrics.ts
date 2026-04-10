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

function parseStyleDeclarations(styleValue: string | null) {
  if (!styleValue) {
    return [];
  }

  return styleValue
    .split(';')
    .map((declaration) => declaration.trim())
    .filter(Boolean)
    .map((declaration) => {
      const separatorIndex = declaration.indexOf(':');
      if (separatorIndex === -1) {
        return null;
      }

      return {
        property: declaration.slice(0, separatorIndex).trim(),
        value: declaration.slice(separatorIndex + 1).trim(),
      };
    })
    .filter((declaration): declaration is { property: string; value: string } => !!declaration);
}

function serializeStyleDeclarations(declarations: Array<{ property: string; value: string }>) {
  if (declarations.length === 0) {
    return null;
  }

  return declarations
    .map((declaration) => `${declaration.property}:${declaration.value}`)
    .join(';');
}

function getStyleDeclarationValue(styleValue: string | null, propertyName: string) {
  const targetProperty = propertyName.toLowerCase();
  const declaration = parseStyleDeclarations(styleValue).find(
    (entry) => entry.property.toLowerCase() === targetProperty
  );

  return declaration?.value ?? null;
}

function upsertStyleDeclaration(
  styleValue: string | null,
  propertyName: string,
  nextValue: string
) {
  const targetProperty = propertyName.toLowerCase();
  const declarations = parseStyleDeclarations(styleValue);
  const existing = declarations.find((entry) => entry.property.toLowerCase() === targetProperty);

  if (existing) {
    existing.value = nextValue;
  } else {
    declarations.push({ property: propertyName, value: nextValue });
  }

  return serializeStyleDeclarations(declarations);
}

function styleContainsExplicitNonDefaultFill(styleValue: string | null) {
  if (!styleValue) {
    return false;
  }

  const fillValue = normalizeColorToken(getStyleDeclarationValue(styleValue, 'fill'));
  if (!fillValue) {
    return false;
  }

  return !!fillValue && fillValue !== 'none' && !OPENSCAD_DEFAULT_FILL_VALUES.has(fillValue);
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

  const styleFillValue = normalizeColorToken(
    getStyleDeclarationValue(geometryElement.getAttribute('style'), 'fill')
  );
  if (styleFillValue && styleFillValue !== 'none') {
    return OPENSCAD_DEFAULT_FILL_VALUES.has(styleFillValue);
  }

  const fillValue = normalizeColorToken(geometryElement.getAttribute('fill'));
  if (!fillValue) {
    return true;
  }

  return fillValue === 'none' || OPENSCAD_DEFAULT_FILL_VALUES.has(fillValue);
}

function applyDefaultFill(geometryElement: Element, defaultFillColor: string) {
  geometryElement.setAttribute('fill', defaultFillColor);

  const nextStyleValue = upsertStyleDeclaration(
    geometryElement.getAttribute('style'),
    'fill',
    defaultFillColor
  );
  if (nextStyleValue) {
    geometryElement.setAttribute('style', nextStyleValue);
  }
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
      applyDefaultFill(geometryElement, options.defaultFillColor);
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
