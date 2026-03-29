/** @jest-environment jsdom */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { jest } from '@jest/globals';
import { ThemeProvider } from '../../contexts/ThemeContext';

const mockTrack = jest.fn();

jest.unstable_mockModule('@/analytics/runtime', () => ({
  bucketCount: (value: number) => String(value),
  createAnalyticsApi: () => ({
    track: (...args: unknown[]) => mockTrack(...args),
    trackError: jest.fn(),
    setAnalyticsEnabled: jest.fn(),
  }),
  inferErrorDomain: () => 'ui',
  setAnalyticsEnabled: jest.fn(),
  trackAnalyticsError: jest.fn(),
  trackAnalyticsEvent: jest.fn(),
  useAnalytics: () => ({
    track: (...args: unknown[]) => mockTrack(...args),
    trackError: jest.fn(),
    setAnalyticsEnabled: jest.fn(),
  }),
}));

let SvgViewer: typeof import('../SvgViewer').SvgViewer;

const rect = {
  x: 0,
  y: 0,
  left: 0,
  top: 0,
  right: 400,
  bottom: 300,
  width: 400,
  height: 300,
  toJSON: () => ({}),
};

const filledSvg = `
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 10">
    <rect x="0" y="0" width="20" height="10" fill="#000000" />
  </svg>
`;

const offOriginSvg = `
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="-50 -25 100 50">
    <rect x="-50" y="-25" width="100" height="50" fill="#000000" />
  </svg>
`;

const emptySvg = `
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 10"></svg>
`;

function renderViewer(src = 'blob:ready') {
  return render(
    <ThemeProvider>
      <SvgViewer src={src} />
    </ThemeProvider>
  );
}

describe('SvgViewer', () => {
  beforeAll(async () => {
    ({ SvgViewer } = await import('../SvgViewer'));
  });

  beforeEach(() => {
    localStorage.clear();
    jest.clearAllMocks();
    (global as typeof globalThis & { fetch: jest.Mock }).fetch = jest.fn();

    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: jest.fn().mockImplementation(() => ({
        matches: false,
        media: '(prefers-color-scheme: dark)',
        onchange: null,
        addListener: jest.fn(),
        removeListener: jest.fn(),
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        dispatchEvent: jest.fn(),
      })),
    });

    Object.defineProperty(window, 'PointerEvent', {
      writable: true,
      value: MouseEvent,
    });

    Object.defineProperty(SVGElement.prototype, 'getScreenCTM', {
      configurable: true,
      value: jest.fn(() => ({
        a: 1,
        b: 0,
        c: 0,
        d: 1,
        e: 0,
        f: 0,
      })),
    });

    class ResizeObserverMock {
      observe() {}
      disconnect() {}
      unobserve() {}
    }

    Object.defineProperty(global, 'ResizeObserver', {
      writable: true,
      value: ResizeObserverMock,
    });

    Object.defineProperty(HTMLElement.prototype, 'getBoundingClientRect', {
      configurable: true,
      value: jest.fn(() => rect),
    });
  });

  it('renders a ready SVG preview and updates the coordinate HUD', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      headers: { get: () => 'image/svg+xml' },
      text: async () => filledSvg,
    });

    renderViewer();

    expect(await screen.findByTestId('preview-2d-overlay')).toBeTruthy();

    const scene = screen.getByTestId('preview-2d-scene');
    fireEvent.pointerMove(scene, { clientX: 200, clientY: 150 });

    expect((await screen.findByTestId('preview-2d-coordinate-readout')).textContent).toMatch(/x/i);
    const renderedSvg = screen
      .getByTestId('preview-2d-stage')
      .querySelector('[data-preview-svg] svg') as SVGSVGElement | null;
    expect(renderedSvg).toBeTruthy();
    expect(renderedSvg?.querySelector('rect')?.getAttribute('vector-effect')).toBe(
      'non-scaling-stroke'
    );
  });

  it('starts off-origin SVG documents centered with a native SVG transform', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      headers: { get: () => 'image/svg+xml' },
      text: async () => offOriginSvg,
    });

    renderViewer('blob:off-origin');

    const stage = await screen.findByTestId('preview-2d-stage');
    expect(stage.tagName.toLowerCase()).toBe('g');
    expect(stage.getAttribute('transform')).toContain('translate(200 150)');
    expect((stage as HTMLElement).style.transform).toBe('');
  });

  it('toggles grid persistence and supports persistent measurement flow', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      headers: { get: () => 'image/svg+xml' },
      text: async () => filledSvg,
    });

    renderViewer();

    expect(await screen.findByTestId('preview-2d-overlay')).toBeTruthy();

    fireEvent.click(screen.getByTestId('preview-2d-toggle-grid'));
    await waitFor(() => {
      const stored = JSON.parse(localStorage.getItem('openscad-studio-settings') || '{}');
      expect(stored.viewer.show2DGrid).toBe(false);
    });

    fireEvent.click(screen.getByTestId('preview-2d-tool-measure'));
    expect(await screen.findByTestId('preview-2d-measure-help')).toBeTruthy();
    expect(mockTrack).toHaveBeenCalledWith(
      'viewer tool selected',
      expect.objectContaining({
        viewer_kind: '2d',
        tool: 'measure_distance',
        input_method: 'toolbar',
        measurement_unit: 'mm',
      })
    );

    const scene = screen.getByTestId('preview-2d-scene');
    const focusTarget = scene.parentElement as HTMLElement;
    fireEvent.click(scene, { clientX: 150, clientY: 150 });
    fireEvent.pointerMove(scene, { clientX: 250, clientY: 150 });

    expect((await screen.findByTestId('preview-2d-measurement-readout')).textContent).toMatch(
      /distance/i
    );

    fireEvent.click(scene, { clientX: 250, clientY: 150 });

    expect(await screen.findByTestId('preview-2d-measurements-tray')).toBeTruthy();
    expect(screen.getAllByTestId('preview-2d-committed-measurement')).toHaveLength(1);
    expect(mockTrack).toHaveBeenCalledWith(
      'measurement committed',
      expect.objectContaining({
        viewer_kind: '2d',
        measurement_kind: 'distance',
        measurement_count: 1,
        measurement_unit: 'mm',
      })
    );
    await waitFor(() => {
      expect(screen.queryByTestId('preview-2d-measurement-readout')).toBeNull();
    });

    focusTarget.focus();
    fireEvent.keyDown(focusTarget, { key: 'Escape' });
    await waitFor(() => {
      expect(screen.queryByTestId('preview-2d-measure-help')).toBeNull();
    });
    expect(mockTrack).toHaveBeenCalledWith(
      'viewer tool selected',
      expect.objectContaining({
        viewer_kind: '2d',
        tool: 'pan',
        input_method: 'shortcut',
        measurement_unit: 'mm',
      })
    );
  });

  it('supports repeated measurements and deleting the selected item', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      headers: { get: () => 'image/svg+xml' },
      text: async () => filledSvg,
    });

    renderViewer('blob:measure-repeat');

    await screen.findByTestId('preview-2d-overlay');

    fireEvent.click(screen.getByTestId('preview-2d-tool-measure'));
    const scene = screen.getByTestId('preview-2d-scene');
    const focusTarget = scene.parentElement as HTMLElement;

    fireEvent.click(scene, { clientX: 120, clientY: 140 });
    fireEvent.pointerMove(scene, { clientX: 200, clientY: 140 });
    fireEvent.click(scene, { clientX: 200, clientY: 140 });

    fireEvent.click(scene, { clientX: 140, clientY: 180 });
    fireEvent.pointerMove(scene, { clientX: 260, clientY: 180 });
    fireEvent.click(scene, { clientX: 260, clientY: 180 });

    expect(screen.getAllByTestId('preview-2d-committed-measurement')).toHaveLength(2);
    expect(screen.getAllByTestId('preview-2d-measurement-list-item')).toHaveLength(2);

    focusTarget.focus();
    fireEvent.keyDown(focusTarget, { key: 'Delete' });

    await waitFor(() => {
      expect(screen.getAllByTestId('preview-2d-committed-measurement')).toHaveLength(1);
    });
  });

  it('tracks clearing measurements with bounded counts', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      headers: { get: () => 'image/svg+xml' },
      text: async () => filledSvg,
    });

    renderViewer('blob:measure-clear');

    await screen.findByTestId('preview-2d-overlay');

    fireEvent.click(screen.getByTestId('preview-2d-tool-measure'));
    const scene = screen.getByTestId('preview-2d-scene');

    fireEvent.click(scene, { clientX: 120, clientY: 140 });
    fireEvent.pointerMove(scene, { clientX: 200, clientY: 140 });
    fireEvent.click(scene, { clientX: 200, clientY: 140 });

    fireEvent.click(scene, { clientX: 140, clientY: 180 });
    fireEvent.pointerMove(scene, { clientX: 260, clientY: 180 });
    fireEvent.click(scene, { clientX: 260, clientY: 180 });

    fireEvent.click(screen.getByTestId('preview-2d-clear-measurements'));

    expect(mockTrack).toHaveBeenCalledWith(
      'measurements cleared',
      expect.objectContaining({
        viewer_kind: '2d',
        cleared_count: 2,
      })
    );
  });

  it('shows empty-state guidance for SVG output with no geometry', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      headers: { get: () => 'image/svg+xml' },
      text: async () => emptySvg,
    });

    renderViewer();

    expect((await screen.findByTestId('preview-2d-empty-banner')).textContent).toMatch(
      /no visible 2d geometry/i
    );
  });

  it('locks the draft measurement angle to 15 degree increments while shift is held', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      headers: { get: () => 'image/svg+xml' },
      text: async () => emptySvg,
    });

    renderViewer('blob:angle-lock');

    await screen.findByTestId('preview-2d-overlay');

    fireEvent.click(screen.getByTestId('preview-2d-tool-measure'));
    const scene = screen.getByTestId('preview-2d-scene');

    fireEvent.click(scene, { clientX: 150, clientY: 150 });
    fireEvent.pointerMove(scene, { clientX: 250, clientY: 160, shiftKey: true });

    const draftLine = document.querySelector(
      '[data-testid="preview-2d-overlay"] line[stroke-dasharray="4 3"]'
    );
    expect(draftLine?.getAttribute('y1')).toBe(draftLine?.getAttribute('y2'));
  });

  it('preserves the last good preview if a subsequent SVG load fails', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        headers: { get: () => 'image/svg+xml' },
        text: async () => filledSvg,
      })
      .mockRejectedValueOnce(new Error('network down'));

    const { rerender } = renderViewer('blob:first');

    expect(await screen.findByTestId('preview-2d-overlay')).toBeTruthy();

    rerender(
      <ThemeProvider>
        <SvgViewer src="blob:second" />
      </ThemeProvider>
    );

    expect((await screen.findByTestId('preview-2d-error-banner')).textContent).toMatch(
      /last successful 2d preview/i
    );
    expect(
      screen.getByTestId('preview-2d-stage').querySelector('[data-preview-svg] svg')
    ).toBeTruthy();
  });

  it('renders distinct x and y axis colors inside the SVG overlay scene', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      headers: { get: () => 'image/svg+xml' },
      text: async () => filledSvg,
    });

    renderViewer('blob:axis-colors');

    await screen.findByTestId('preview-2d-overlay');
    const xAxis = document.querySelector('[data-axis="x"]');
    const yAxis = document.querySelector('[data-axis="y"]');

    expect(xAxis).toBeTruthy();
    expect(yAxis).toBeTruthy();
    expect(xAxis?.getAttribute('stroke')).not.toBe(yAxis?.getAttribute('stroke'));
  });
});
