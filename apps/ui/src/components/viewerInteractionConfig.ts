import type { CameraControlsProps } from '@react-three/drei/core/CameraControls';

type ViewerMouseButtons = NonNullable<CameraControlsProps['mouseButtons']>;
type ViewerTouches = NonNullable<CameraControlsProps['touches']>;

export interface ViewerInteractionConfig {
  mouseButtons: ViewerMouseButtons;
  touches: ViewerTouches;
  desktopHint: string;
  touchHint: string;
}

export const VIEWER_CONTROL_ACTIONS = {
  ROTATE: 1,
  TRUCK: 2,
  DOLLY: 16,
  TOUCH_ROTATE: 64,
  TOUCH_TRUCK: 128,
  TOUCH_DOLLY_TRUCK: 4096,
} as const;

export function createViewerInteractionConfig(shiftPanActive = false): ViewerInteractionConfig {
  return {
    mouseButtons: {
      left: shiftPanActive ? VIEWER_CONTROL_ACTIONS.TRUCK : VIEWER_CONTROL_ACTIONS.ROTATE,
      middle: VIEWER_CONTROL_ACTIONS.TRUCK,
      right: VIEWER_CONTROL_ACTIONS.TRUCK,
      wheel: VIEWER_CONTROL_ACTIONS.DOLLY,
    },
    touches: {
      one: VIEWER_CONTROL_ACTIONS.TOUCH_ROTATE,
      two: VIEWER_CONTROL_ACTIONS.TOUCH_DOLLY_TRUCK,
      three: VIEWER_CONTROL_ACTIONS.TOUCH_TRUCK,
    },
    desktopHint: 'Drag to orbit. Right-drag or Shift-drag to pan. Wheel to zoom.',
    touchHint: 'One finger orbits. Two fingers pan and zoom. Three fingers pan.',
  };
}
