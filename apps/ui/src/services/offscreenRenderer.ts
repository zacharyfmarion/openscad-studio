import * as THREE from 'three';
import { STLLoader } from 'three-stdlib';
import {
  FALLBACK_PREVIEW_SCENE_STYLE,
  type PreviewSceneStyle,
} from './previewSceneConfig';

export type PresetView = 'front' | 'back' | 'top' | 'bottom' | 'left' | 'right' | 'isometric';

export interface CaptureOptions {
  view?: PresetView | 'current';
  azimuth?: number;
  elevation?: number;
  width?: number;
  height?: number;
  sceneStyle?: PreviewSceneStyle;
}

const PRESET_DIRECTIONS: Record<PresetView, [number, number, number]> = {
  front: [0, 0, 1],
  back: [0, 0, -1],
  top: [0, 1, 0],
  bottom: [0, -1, 0],
  left: [-1, 0, 0],
  right: [1, 0, 0],
  isometric: [1, 1, 1],
};

function computeCameraPosition(
  direction: [number, number, number],
  center: THREE.Vector3,
  distance: number
): THREE.Vector3 {
  const dir = new THREE.Vector3(...direction).normalize();
  return center.clone().add(dir.multiplyScalar(distance));
}

function azimuthElevationToDirection(
  azimuthDeg: number,
  elevationDeg: number
): [number, number, number] {
  const az = (azimuthDeg * Math.PI) / 180;
  const el = (elevationDeg * Math.PI) / 180;
  const cosEl = Math.cos(el);
  return [cosEl * Math.sin(az), Math.sin(el), cosEl * Math.cos(az)];
}

export async function captureOffscreen(
  stlBlobUrl: string,
  options: CaptureOptions = {}
): Promise<string> {
  const sceneStyle = options.sceneStyle ?? FALLBACK_PREVIEW_SCENE_STYLE;
  const {
    width = sceneStyle.screenshot.width,
    height = sceneStyle.screenshot.height,
  } = options;

  const geometry = await new Promise<THREE.BufferGeometry>((resolve, reject) => {
    const loader = new STLLoader();
    loader.load(stlBlobUrl, resolve, undefined, reject);
  });
  geometry.computeVertexNormals();

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    preserveDrawingBuffer: true,
  });
  renderer.setSize(width, height);
  renderer.setPixelRatio(1);
  renderer.shadowMap.enabled =
    sceneStyle.contactShadows.enabledByDefault || sceneStyle.directionalLight.intensity > 0;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(sceneStyle.backgroundColor);

  const material = new THREE.MeshStandardMaterial({
    color: sceneStyle.modelColor,
    metalness: sceneStyle.material.metalness,
    roughness: sceneStyle.material.roughness,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);

  const ambientLight = new THREE.AmbientLight(
    sceneStyle.ambientLight.color,
    sceneStyle.ambientLight.intensity
  );
  scene.add(ambientLight);

  const directionalLight = new THREE.DirectionalLight(
    sceneStyle.directionalLight.color,
    sceneStyle.directionalLight.intensity
  );
  directionalLight.position.set(...sceneStyle.directionalLight.position);
  directionalLight.castShadow = true;
  directionalLight.shadow.mapSize.set(...sceneStyle.directionalLight.shadowMapSize);
  scene.add(directionalLight);

  const box = new THREE.Box3().setFromObject(mesh);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z);
  const distance = maxDim * sceneStyle.camera.frameDistanceMultiplier;

  let direction: [number, number, number];
  if (options.azimuth !== undefined || options.elevation !== undefined) {
    direction = azimuthElevationToDirection(options.azimuth ?? 45, options.elevation ?? 30);
  } else {
    const preset = (options.view as PresetView) || 'isometric';
    direction = PRESET_DIRECTIONS[preset] ?? PRESET_DIRECTIONS.isometric;
  }

  const camera = new THREE.PerspectiveCamera(
    sceneStyle.camera.perspectiveFov,
    width / height,
    sceneStyle.camera.near,
    Math.max(distance * sceneStyle.camera.farMultiplier, sceneStyle.camera.near + 1)
  );
  camera.position.copy(computeCameraPosition(direction, center, distance));
  camera.lookAt(center);

  renderer.render(scene, camera);
  const dataUrl = canvas.toDataURL('image/png');

  geometry.dispose();
  material.dispose();
  renderer.dispose();
  renderer.forceContextLoss();

  return dataUrl;
}
