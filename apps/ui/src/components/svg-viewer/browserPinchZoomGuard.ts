const PINCH_GUARD_LISTENER_OPTIONS = { capture: true, passive: false } as const;

function shouldPreventBrowserPinchZoom(event: Event, element: HTMLElement, isGuardActive: boolean) {
  const target = event.target;
  const isWithinElement = target instanceof Node && element.contains(target);
  if ((!isGuardActive && !isWithinElement) || !event.cancelable) {
    return false;
  }

  if (event.type === 'wheel') {
    const wheelEvent = event as WheelEvent;
    return wheelEvent.ctrlKey;
  }

  return true;
}

export function attachBrowserPinchZoomGuard(element: HTMLElement) {
  let isGuardActive = false;

  const handlePointerEnter = () => {
    isGuardActive = true;
  };
  const handlePointerLeave = () => {
    isGuardActive = false;
  };
  const handleFocus = () => {
    isGuardActive = true;
  };
  const handleBlur = () => {
    isGuardActive = false;
  };
  const preventBrowserPinchZoom = (event: Event) => {
    if (!shouldPreventBrowserPinchZoom(event, element, isGuardActive)) {
      return;
    }

    event.preventDefault();
  };

  const ownerDocument = element.ownerDocument;

  element.addEventListener('pointerenter', handlePointerEnter);
  element.addEventListener('pointerleave', handlePointerLeave);
  element.addEventListener('focus', handleFocus);
  element.addEventListener('blur', handleBlur);
  ownerDocument.addEventListener(
    'gesturestart',
    preventBrowserPinchZoom,
    PINCH_GUARD_LISTENER_OPTIONS
  );
  ownerDocument.addEventListener(
    'gesturechange',
    preventBrowserPinchZoom,
    PINCH_GUARD_LISTENER_OPTIONS
  );
  ownerDocument.addEventListener(
    'gestureend',
    preventBrowserPinchZoom,
    PINCH_GUARD_LISTENER_OPTIONS
  );
  ownerDocument.addEventListener('wheel', preventBrowserPinchZoom, PINCH_GUARD_LISTENER_OPTIONS);

  return () => {
    isGuardActive = false;
    element.removeEventListener('pointerenter', handlePointerEnter);
    element.removeEventListener('pointerleave', handlePointerLeave);
    element.removeEventListener('focus', handleFocus);
    element.removeEventListener('blur', handleBlur);
    ownerDocument.removeEventListener(
      'gesturestart',
      preventBrowserPinchZoom,
      PINCH_GUARD_LISTENER_OPTIONS
    );
    ownerDocument.removeEventListener(
      'gesturechange',
      preventBrowserPinchZoom,
      PINCH_GUARD_LISTENER_OPTIONS
    );
    ownerDocument.removeEventListener(
      'gestureend',
      preventBrowserPinchZoom,
      PINCH_GUARD_LISTENER_OPTIONS
    );
    ownerDocument.removeEventListener(
      'wheel',
      preventBrowserPinchZoom,
      PINCH_GUARD_LISTENER_OPTIONS
    );
  };
}
