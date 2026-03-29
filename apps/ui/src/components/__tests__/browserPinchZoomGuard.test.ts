/** @jest-environment jsdom */

import { fireEvent } from '@testing-library/react';
import { attachBrowserPinchZoomGuard } from '../svg-viewer/browserPinchZoomGuard';

describe('browserPinchZoomGuard', () => {
  let element: HTMLDivElement;
  let child: HTMLSpanElement;

  beforeEach(() => {
    element = document.createElement('div');
    element.tabIndex = 0;
    child = document.createElement('span');
    element.appendChild(child);
    document.body.appendChild(element);
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('prevents gesture events while the guarded viewer is active', () => {
    const cleanup = attachBrowserPinchZoomGuard(element);

    fireEvent.pointerEnter(element, { pointerId: 1, clientX: 50, clientY: 50 });

    const gestureEvent = new Event('gesturestart', { bubbles: true, cancelable: true });
    fireEvent(child, gestureEvent);

    expect(gestureEvent.defaultPrevented).toBe(true);

    cleanup();
  });

  it('prevents ctrl-wheel pinch events when they originate inside the guarded viewer', () => {
    const cleanup = attachBrowserPinchZoomGuard(element);

    const wheelEvent = new WheelEvent('wheel', {
      bubbles: true,
      cancelable: true,
      ctrlKey: true,
      deltaY: -120,
    });
    fireEvent(child, wheelEvent);

    expect(wheelEvent.defaultPrevented).toBe(true);

    cleanup();
  });

  it('ignores normal wheel events and removes listeners on cleanup', () => {
    const cleanup = attachBrowserPinchZoomGuard(element);

    const normalWheelEvent = new WheelEvent('wheel', {
      bubbles: true,
      cancelable: true,
      ctrlKey: false,
      deltaY: -120,
    });
    fireEvent(child, normalWheelEvent);
    expect(normalWheelEvent.defaultPrevented).toBe(false);

    cleanup();

    fireEvent.pointerEnter(element, { pointerId: 1, clientX: 50, clientY: 50 });
    const gestureEvent = new Event('gesturestart', { bubbles: true, cancelable: true });
    fireEvent(child, gestureEvent);
    expect(gestureEvent.defaultPrevented).toBe(false);
  });
});
