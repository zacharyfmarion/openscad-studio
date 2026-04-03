import type { Theme } from '../themes';

export interface PreviewSceneStyle {
  backgroundColor: string;
  gridColor: string;
  gridSectionColor: string;
  modelColor: string;
  svgModelColor: string;
  environmentPreset: 'city';
  material: {
    metalness: number;
    roughness: number;
    envMapIntensity: number;
  };
  axis: {
    xColor: string;
    yColor: string;
    zColor: string;
    tickColor: string;
    labelColor: string;
  };
  ambientLight: {
    color: string;
    intensity: number;
  };
  directionalLight: {
    color: string;
    intensity: number;
    position: [number, number, number];
    shadowMapSize: [number, number];
  };
  contactShadows: {
    opacity: number;
    scale: number;
    blur: number;
    far: number;
    enabledByDefault: boolean;
  };
  camera: {
    defaultPosition: [number, number, number];
    orthographicZoom: number;
    perspectiveFov: number;
    near: number;
    orthographicNear: number;
    baseFar: number;
    baseMaxDistance: number;
    frameDistanceMultiplier: number;
    farMultiplier: number;
    fitPaddingRatio: number;
    maxDistanceMultiplier: number;
  };
  screenshot: {
    width: number;
    height: number;
  };
}

const SHARED_PREVIEW_SCENE_BASE: Omit<
  PreviewSceneStyle,
  'backgroundColor' | 'gridColor' | 'gridSectionColor' | 'modelColor' | 'svgModelColor'
> = {
  environmentPreset: 'city',
  material: {
    metalness: 0.3,
    roughness: 0.4,
    envMapIntensity: 0.9,
  },
  axis: {
    xColor: '#5cc8ff',
    yColor: '#ffd166',
    zColor: '#ef476f',
    tickColor: '#7aa6b3',
    labelColor: '#d3edf0',
  },
  ambientLight: {
    color: '#ffffff',
    intensity: 0.5,
  },
  directionalLight: {
    color: '#ffffff',
    intensity: 1,
    position: [10, 10, 5],
    shadowMapSize: [2048, 2048],
  },
  contactShadows: {
    opacity: 0.3,
    scale: 200,
    blur: 2,
    far: 50,
    enabledByDefault: true,
  },
  camera: {
    defaultPosition: [100, 100, 100],
    orthographicZoom: 2,
    perspectiveFov: 50,
    near: 0.1,
    orthographicNear: -1000,
    baseFar: 2000,
    baseMaxDistance: 500,
    frameDistanceMultiplier: 2.5,
    farMultiplier: 10,
    fitPaddingRatio: 0.05,
    maxDistanceMultiplier: 4,
  },
  screenshot: {
    width: 800,
    height: 600,
  },
};

function clampChannel(value: number) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function parseHexColor(value: string) {
  const normalized = value.trim();
  const shortHex = normalized.match(/^#([\da-f]{3})$/i);
  if (shortHex) {
    const [r, g, b] = shortHex[1]
      .split('')
      .map((channel) => Number.parseInt(channel + channel, 16));
    return { r, g, b };
  }

  const fullHex = normalized.match(/^#([\da-f]{6})$/i);
  if (fullHex) {
    return {
      r: Number.parseInt(fullHex[1].slice(0, 2), 16),
      g: Number.parseInt(fullHex[1].slice(2, 4), 16),
      b: Number.parseInt(fullHex[1].slice(4, 6), 16),
    };
  }

  return null;
}

function formatHexColor({ r, g, b }: { r: number; g: number; b: number }) {
  return `#${[r, g, b]
    .map((channel) => clampChannel(channel).toString(16).padStart(2, '0'))
    .join('')}`;
}

function blendHexColors(baseColor: string, targetColor: string, ratio: number) {
  const base = parseHexColor(baseColor);
  const target = parseHexColor(targetColor);
  if (!base || !target) {
    return targetColor;
  }

  const clampedRatio = Math.max(0, Math.min(1, ratio));
  return formatHexColor({
    r: base.r + (target.r - base.r) * clampedRatio,
    g: base.g + (target.g - base.g) * clampedRatio,
    b: base.b + (target.b - base.b) * clampedRatio,
  });
}

function getRelativeLuminance(color: string) {
  const parsed = parseHexColor(color);
  if (!parsed) {
    return 0.5;
  }

  const channels = [parsed.r, parsed.g, parsed.b].map((channel) => {
    const srgb = channel / 255;
    return srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
  });

  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function getPreviewSvgModelColor(theme: Theme) {
  const isLightTheme = getRelativeLuminance(theme.colors.bg.primary) > 0.45;
  return blendHexColors(
    theme.colors.bg.primary,
    theme.colors.bg.tertiary,
    isLightTheme ? 0.48 : 0.24
  );
}

export const FALLBACK_PREVIEW_SCENE_STYLE: PreviewSceneStyle = {
  ...SHARED_PREVIEW_SCENE_BASE,
  backgroundColor: '#f0f0f0',
  gridColor: '#d0d0d0',
  gridSectionColor: '#b8b8b8',
  modelColor: '#6699cc',
  svgModelColor: '#dcdcdc',
};

export function getPreviewSceneStyle(theme: Theme): PreviewSceneStyle {
  return {
    ...SHARED_PREVIEW_SCENE_BASE,
    backgroundColor: theme.colors.bg.primary,
    gridColor: theme.colors.border.secondary,
    gridSectionColor: theme.colors.border.primary,
    modelColor: theme.colors.accent.secondary,
    svgModelColor: getPreviewSvgModelColor(theme),
    axis: {
      xColor: theme.colors.accent.primary,
      yColor: theme.colors.accent.secondary,
      zColor: theme.colors.semantic.error,
      tickColor: theme.colors.border.secondary,
      labelColor: theme.colors.text.secondary,
    },
  };
}
