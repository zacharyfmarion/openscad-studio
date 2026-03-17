import * as THREE from 'three';
import type { PreviewAxisMetrics } from './previewFraming';
import type { PreviewSceneStyle } from './previewSceneConfig';

const AXIS_ELEVATION = 0.02;
const AXIS_LINE_EXTENT_MULTIPLIER = 20;
const MIN_AXIS_LINE_EXTENT = 10_000;
// Target label height as a fraction of the visible viewport height (keeps labels
// roughly constant in screen-space regardless of zoom level).
const LABEL_SCREEN_FRACTION = 0.018;
type Disposable = { dispose: () => void };
type AxisLabelKey = 'x' | 'y' | 'z' | 'origin';

export type PreviewAxisLabelVisibility = Record<AxisLabelKey, boolean>;

export function createPreviewAxesOverlay(
  axisMetrics: PreviewAxisMetrics,
  sceneStyle: PreviewSceneStyle,
  options: {
    showLabels?: boolean;
  } = {}
): THREE.Group {
  const group = new THREE.Group();
  const disposables: Disposable[] = [];
  const showLabels = options.showLabels ?? true;
  const labelSprites: Record<AxisLabelKey, THREE.Sprite[]> = {
    x: [],
    y: [],
    z: [],
    origin: [],
  };
  // All sprites with their creation-time height and aspect, used for distance-based scaling.
  const allLabelSprites: Array<{ sprite: THREE.Sprite; aspect: number; baseHeight: number }> = [];
  // Reference height used when computing the scale factor (tick label size).
  const referenceHeight = axisMetrics.majorTickSize * 1.2;
  const lineExtent = Math.max(
    axisMetrics.axisExtent * AXIS_LINE_EXTENT_MULTIPLIER,
    MIN_AXIS_LINE_EXTENT
  );

  const xAxisMaterial = createLineMaterial(sceneStyle.axis.xColor, 0.95);
  const yAxisMaterial = createLineMaterial(sceneStyle.axis.yColor, 0.95);
  const zAxisMaterial = createLineMaterial(sceneStyle.axis.zColor, 0.95);
  const minorTickMaterial = createLineMaterial(sceneStyle.axis.tickColor, 0.45);
  const majorTickMaterial = createLineMaterial(sceneStyle.axis.tickColor, 0.75);

  group.add(
    createLine(
      [
        [-lineExtent, AXIS_ELEVATION, 0],
        [lineExtent, AXIS_ELEVATION, 0],
      ],
      xAxisMaterial
    )
  );
  group.add(
    createLine(
      [
        [0, AXIS_ELEVATION, -lineExtent],
        [0, AXIS_ELEVATION, lineExtent],
      ],
      yAxisMaterial
    )
  );
  group.add(
    createLine(
      [
        [0, -lineExtent, 0],
        [0, lineExtent, 0],
      ],
      zAxisMaterial
    )
  );

  const minorTickSegments: number[] = [];
  const majorTickSegments: number[] = [];

  for (
    let value = -axisMetrics.axisExtent;
    value <= axisMetrics.axisExtent + axisMetrics.minorStep * 0.5;
    value += axisMetrics.minorStep
  ) {
    if (isNearMajorTick(value, axisMetrics.majorStep)) {
      continue;
    }

    appendSegment(
      minorTickSegments,
      [value, AXIS_ELEVATION, -axisMetrics.minorTickSize * 0.5],
      [value, AXIS_ELEVATION, axisMetrics.minorTickSize * 0.5]
    );
    appendSegment(
      minorTickSegments,
      [-axisMetrics.minorTickSize * 0.5, AXIS_ELEVATION, value],
      [axisMetrics.minorTickSize * 0.5, AXIS_ELEVATION, value]
    );
    appendSegment(
      minorTickSegments,
      [-axisMetrics.minorTickSize * 0.5, value, 0],
      [axisMetrics.minorTickSize * 0.5, value, 0]
    );
  }

  for (
    let value = -axisMetrics.axisExtent;
    value <= axisMetrics.axisExtent + axisMetrics.majorStep * 0.5;
    value += axisMetrics.majorStep
  ) {
    appendSegment(
      majorTickSegments,
      [value, AXIS_ELEVATION, -axisMetrics.majorTickSize * 0.5],
      [value, AXIS_ELEVATION, axisMetrics.majorTickSize * 0.5]
    );
    appendSegment(
      majorTickSegments,
      [-axisMetrics.majorTickSize * 0.5, AXIS_ELEVATION, value],
      [axisMetrics.majorTickSize * 0.5, AXIS_ELEVATION, value]
    );
    appendSegment(
      majorTickSegments,
      [-axisMetrics.majorTickSize * 0.5, value, 0],
      [axisMetrics.majorTickSize * 0.5, value, 0]
    );
  }

  if (minorTickSegments.length > 0) {
    group.add(createLineSegments(minorTickSegments, minorTickMaterial));
  }
  if (majorTickSegments.length > 0) {
    group.add(createLineSegments(majorTickSegments, majorTickMaterial));
  }

  if (showLabels) {
    for (
      let value = -axisMetrics.axisExtent;
      value <= axisMetrics.axisExtent + axisMetrics.labelStep * 0.5;
      value += axisMetrics.labelStep
    ) {
      if (Math.abs(value) < axisMetrics.labelStep * 0.25) {
        continue;
      }

      group.add(
        createLabelSprite(
          formatAxisLabel(value, axisMetrics.labelPrecision),
          [value, AXIS_ELEVATION, axisMetrics.majorTickSize * 1.8],
          axisMetrics.majorTickSize * 1.2,
          sceneStyle,
          disposables,
          labelSprites.x,
          allLabelSprites
        )
      );
      group.add(
        createLabelSprite(
          formatAxisLabel(value, axisMetrics.labelPrecision),
          [axisMetrics.majorTickSize * 1.8, AXIS_ELEVATION, value],
          axisMetrics.majorTickSize * 1.2,
          sceneStyle,
          disposables,
          labelSprites.y,
          allLabelSprites
        )
      );
      group.add(
        createLabelSprite(
          formatAxisLabel(value, axisMetrics.labelPrecision),
          [axisMetrics.majorTickSize * 1.8, value, 0],
          axisMetrics.majorTickSize * 1.2,
          sceneStyle,
          disposables,
          labelSprites.z,
          allLabelSprites
        )
      );
    }

    group.add(
      createLabelSprite(
        '0',
        [axisMetrics.majorTickSize * 1.4, AXIS_ELEVATION, axisMetrics.majorTickSize * 1.4],
        axisMetrics.majorTickSize * 1.1,
        sceneStyle,
        disposables,
        labelSprites.origin,
        allLabelSprites
      )
    );
    group.add(
      createLabelSprite(
        'X',
        [axisMetrics.axisExtent + axisMetrics.majorTickSize * 1.8, AXIS_ELEVATION, 0],
        axisMetrics.majorTickSize * 1.5,
        sceneStyle,
        disposables,
        labelSprites.x,
        allLabelSprites,
        sceneStyle.axis.xColor
      )
    );
    group.add(
      createLabelSprite(
        'Y',
        [0, AXIS_ELEVATION, axisMetrics.axisExtent + axisMetrics.majorTickSize * 1.8],
        axisMetrics.majorTickSize * 1.5,
        sceneStyle,
        disposables,
        labelSprites.y,
        allLabelSprites,
        sceneStyle.axis.yColor
      )
    );
    group.add(
      createLabelSprite(
        'Z',
        [0, axisMetrics.axisExtent + axisMetrics.majorTickSize * 1.8, 0],
        axisMetrics.majorTickSize * 1.5,
        sceneStyle,
        disposables,
        labelSprites.z,
        allLabelSprites,
        sceneStyle.axis.zColor
      )
    );
  }

  group.userData.setAxisLabelsVisibility = (visibility: PreviewAxisLabelVisibility) => {
    for (const [axis, sprites] of Object.entries(labelSprites) as Array<
      [AxisLabelKey, THREE.Sprite[]]
    >) {
      for (const sprite of sprites) {
        sprite.visible = visibility[axis];
      }
    }
  };

  group.userData.updateLabelScales = (camera: THREE.Camera) => {
    let targetHeight: number;

    if (camera instanceof THREE.PerspectiveCamera) {
      const dist = camera.position.length();
      const tanHalfFov = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
      targetHeight = LABEL_SCREEN_FRACTION * 2 * dist * tanHalfFov;
    } else {
      const oc = camera as THREE.OrthographicCamera;
      const visibleWorldHeight = (oc.top - oc.bottom) / oc.zoom;
      targetHeight = LABEL_SCREEN_FRACTION * visibleWorldHeight;
    }

    const scaleFactor = targetHeight / referenceHeight;

    for (const { sprite, aspect, baseHeight } of allLabelSprites) {
      const h = baseHeight * scaleFactor;
      sprite.scale.set(h * aspect, h, 1);
    }
  };

  group.userData.disposePreviewAxesOverlay = () => {
    for (const object of disposables) {
      object.dispose();
    }

    group.traverse((child) => {
      disposeObjectResources(
        child as THREE.Object3D & {
          geometry?: Disposable;
          material?: Disposable | Disposable[];
        }
      );
    });
  };

  return group;
}

export function disposePreviewAxesOverlay(group: THREE.Group) {
  const dispose = group.userData.disposePreviewAxesOverlay;
  if (typeof dispose === 'function') {
    dispose();
  }
}

function createLine(points: Array<[number, number, number]>, material: THREE.LineBasicMaterial) {
  const geometry = new THREE.BufferGeometry().setFromPoints(
    points.map((point) => new THREE.Vector3(...point))
  );
  const line = new THREE.Line(geometry, material);
  line.frustumCulled = false;
  line.renderOrder = 2;
  return line;
}

function createLineSegments(segments: number[], material: THREE.LineBasicMaterial) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(segments, 3));
  const lineSegments = new THREE.LineSegments(geometry, material);
  lineSegments.frustumCulled = false;
  lineSegments.renderOrder = 2;
  return lineSegments;
}

function createLineMaterial(color: string, opacity: number) {
  const material = new THREE.LineBasicMaterial({
    color,
    depthTest: false,
    transparent: opacity < 1,
    opacity,
    depthWrite: false,
    toneMapped: false,
  });
  return material;
}

function createLabelSprite(
  text: string,
  position: [number, number, number],
  worldHeight: number,
  sceneStyle: PreviewSceneStyle,
  disposables: Disposable[],
  labelSprites: THREE.Sprite[],
  allSprites: Array<{ sprite: THREE.Sprite; aspect: number; baseHeight: number }>,
  color = sceneStyle.axis.labelColor
) {
  const { texture, aspect } = createLabelTexture(text, color, sceneStyle.backgroundColor);
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
  });
  const sprite = new THREE.Sprite(material);

  sprite.position.set(position[0], position[1] + worldHeight * 0.5, position[2]);
  sprite.scale.set(worldHeight * aspect, worldHeight, 1);
  sprite.renderOrder = 3;

  disposables.push(texture);
  labelSprites.push(sprite);
  allSprites.push({ sprite, aspect, baseHeight: worldHeight });

  return sprite;
}

function createLabelTexture(text: string, color: string, backgroundColor: string) {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');

  if (!context) {
    const texture = new THREE.CanvasTexture(canvas);
    return { texture, aspect: 1 };
  }

  const fontSize = 64;
  const paddingX = 28;
  const paddingY = 18;

  context.font = `600 ${fontSize}px sans-serif`;
  const measuredWidth = Math.ceil(context.measureText(text).width);
  const width = measuredWidth + paddingX * 2;
  const height = fontSize + paddingY * 2;

  canvas.width = width;
  canvas.height = height;

  context.font = `600 ${fontSize}px sans-serif`;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillStyle = withAlpha(backgroundColor, 0.76);
  drawRoundedRect(context, 0, 0, width, height, 16);
  context.fill();
  context.lineWidth = 4;
  context.strokeStyle = withAlpha(backgroundColor, 0.95);
  context.stroke();
  context.fillStyle = color;
  context.fillText(text, width / 2, height / 2 + 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;

  return {
    texture,
    aspect: width / height,
  };
}

function drawRoundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
) {
  const clampedRadius = Math.min(radius, width / 2, height / 2);

  context.beginPath();
  context.moveTo(x + clampedRadius, y);
  context.lineTo(x + width - clampedRadius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + clampedRadius);
  context.lineTo(x + width, y + height - clampedRadius);
  context.quadraticCurveTo(x + width, y + height, x + width - clampedRadius, y + height);
  context.lineTo(x + clampedRadius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - clampedRadius);
  context.lineTo(x, y + clampedRadius);
  context.quadraticCurveTo(x, y, x + clampedRadius, y);
  context.closePath();
}

function appendSegment(
  target: number[],
  start: [number, number, number],
  end: [number, number, number]
) {
  target.push(...start, ...end);
}

function isNearMajorTick(value: number, majorStep: number) {
  if (majorStep <= 0) {
    return false;
  }

  const nearestMajor = Math.round(value / majorStep) * majorStep;
  return Math.abs(nearestMajor - value) < 1e-6;
}

function formatAxisLabel(value: number, precision: number) {
  const rounded = Number(value.toFixed(precision));

  if (Object.is(rounded, -0)) {
    return '0';
  }

  return precision > 0 ? rounded.toFixed(precision).replace(/\.?0+$/, '') : `${rounded}`;
}

function withAlpha(color: string, alpha: number) {
  const hex = color.replace('#', '');

  if (hex.length === 3) {
    const [r, g, b] = hex.split('').map((digit) => parseInt(`${digit}${digit}`, 16));
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  if (hex.length === 6) {
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  return color;
}

function disposeObjectResources(
  object: THREE.Object3D & {
    geometry?: Disposable;
    material?: Disposable | Disposable[];
  }
) {
  object.geometry?.dispose();

  if (Array.isArray(object.material)) {
    object.material.forEach((entry) => entry.dispose());
    return;
  }

  object.material?.dispose();
}
