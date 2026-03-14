import type { Theme } from '../themes';

export interface PreviewSceneStyle {
  backgroundColor: string;
  gridColor: string;
  gridSectionColor: string;
  modelColor: string;
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
  'backgroundColor' | 'gridColor' | 'gridSectionColor' | 'modelColor'
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

export const FALLBACK_PREVIEW_SCENE_STYLE: PreviewSceneStyle = {
  ...SHARED_PREVIEW_SCENE_BASE,
  backgroundColor: '#f0f0f0',
  gridColor: '#d0d0d0',
  gridSectionColor: '#b8b8b8',
  modelColor: '#6699cc',
};

export function getPreviewSceneStyle(theme: Theme): PreviewSceneStyle {
  return {
    ...SHARED_PREVIEW_SCENE_BASE,
    backgroundColor: theme.colors.bg.primary,
    gridColor: theme.colors.border.secondary,
    gridSectionColor: theme.colors.border.primary,
    modelColor: theme.colors.accent.secondary,
    axis: {
      xColor: theme.colors.accent.primary,
      yColor: theme.colors.accent.secondary,
      zColor: theme.colors.semantic.error,
      tickColor: theme.colors.border.secondary,
      labelColor: theme.colors.text.secondary,
    },
  };
}
