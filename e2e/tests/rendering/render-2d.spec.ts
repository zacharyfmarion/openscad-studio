import { test, expect } from '../../fixtures/app.fixture';
import { setMonacoValue } from '../../helpers/editor';

function parseCoordinateReadout(readout: string | null): { x: number; y: number } | null {
  if (!readout) return null;
  const match = readout.match(/x\s*(-?\d+(?:\.\d+)?)\s+y\s*(-?\d+(?:\.\d+)?)/i);
  if (!match) return null;
  return {
    x: Number(match[1]),
    y: Number(match[2]),
  };
}

test.describe('2D Rendering', () => {
  // The app auto-detects 2D vs 3D code and renders SVGs for 2D primitives.
  // These tests verify that pure 2D OpenSCAD code renders correctly as SVG
  // via the auto-detection / dimension-mismatch retry logic.

  test('renders 2D square as SVG', async ({ app }) => {
    await app.waitForRender();
    await setMonacoValue(app.page, 'square([20, 10]);');
    await app.triggerRender();
    await app.waitForRender();
    await expect(app.previewSvg2D).toBeVisible();
  });

  test('renders 2D circle as SVG', async ({ app }) => {
    await app.waitForRender();
    await setMonacoValue(app.page, 'circle(r = 10, $fn = 64);');
    await app.triggerRender();
    await app.waitForRender();
    await expect(app.previewSvg2D).toBeVisible();
  });

  test('renders 2D boolean operations as SVG', async ({ app }) => {
    await app.waitForRender();
    await setMonacoValue(
      app.page,
      'difference() {\n  square(20, center = true);\n  circle(8, $fn = 32);\n}'
    );
    await app.triggerRender();
    await app.waitForRender();
    await expect(app.previewSvg2D).toBeVisible();
  });

  test.skip('renders 2D text as SVG', async ({ app }) => {
    // WASM LIMITATION: text() requires fonts that are not available in the
    // OpenSCAD WASM environment, so it produces empty output in both modes.
    await app.waitForRender();
    await setMonacoValue(app.page, 'text("Hi", size = 10);');
    await app.triggerRender();
    await app.waitForRender();
    await expect(app.previewSvg2D).toBeVisible();
  });

  test('renders 2D polygon as SVG', async ({ app }) => {
    await app.waitForRender();
    await setMonacoValue(app.page, 'polygon(points = [[0,0],[10,0],[5,8]]);');
    await app.triggerRender();
    await app.waitForRender();
    await expect(app.previewSvg2D).toBeVisible();
  });

  test('viewer toolbar can re-fit after zooming', async ({ app }) => {
    await app.waitForRender();
    await setMonacoValue(app.page, 'square([40, 20]);');
    await app.triggerRender();
    await app.waitForRender();

    const stage = app.page.getByTestId('preview-2d-stage');
    const initialTransform = await stage.evaluate((element) => element.getAttribute('transform'));

    await app.page.getByTestId('preview-2d-zoom-in').click();
    const zoomedTransform = await stage.evaluate((element) => element.getAttribute('transform'));
    expect(zoomedTransform).not.toBe(initialTransform);

    await app.page.getByTestId('preview-2d-fit').click();
    const refitTransform = await stage.evaluate((element) => element.getAttribute('transform'));
    expect(refitTransform).toBe(initialTransform);
  });

  test('off-origin SVG content starts centered in the pane', async ({ app }) => {
    await app.waitForRender();
    await setMonacoValue(app.page, 'square([20, 10], center = true);');
    await app.triggerRender();
    await app.waitForRender();

    const viewport = app.page.getByTestId('preview-2d-viewport');
    const box = await viewport.boundingBox();
    expect(box).not.toBeNull();

    await viewport.hover({ position: { x: box!.width / 2, y: box!.height / 2 } });
    const readout = await app.page.getByTestId('preview-2d-coordinate-readout').textContent();
    const point = parseCoordinateReadout(readout);
    expect(point).not.toBeNull();
    expect(Math.abs(point!.x)).toBeLessThan(2);
    expect(Math.abs(point!.y)).toBeLessThan(2);
  });

  test('grid toggle and keyboard shortcut update the SVG overlay', async ({ app }) => {
    await app.waitForRender();
    await setMonacoValue(app.page, 'square([30, 15]);');
    await app.triggerRender();
    await app.waitForRender();
    await app.page.getByTestId('preview-2d-zoom-out').click();
    await app.page.getByTestId('preview-2d-zoom-out').click();
    await app.page.waitForTimeout(150);

    const scene = app.page.getByTestId('preview-2d-scene');
    const gridToggle = app.page.getByTestId('preview-2d-toggle-grid');
    const beforeButtonColor = await gridToggle.evaluate(
      (element) => getComputedStyle(element).backgroundColor
    );
    const before = await scene.screenshot();
    await gridToggle.click();
    await app.page.waitForTimeout(150);
    const afterToolbarButtonColor = await gridToggle.evaluate(
      (element) => getComputedStyle(element).backgroundColor
    );
    const afterToolbarToggle = await scene.screenshot();
    expect(afterToolbarButtonColor).not.toBe(beforeButtonColor);
    expect(afterToolbarToggle.equals(before)).toBe(false);

    const root = app.page.getByTestId('preview-2d-root');
    await root.click();
    await app.page.keyboard.press('g');
    await app.page.waitForTimeout(150);
    const afterKeyboardButtonColor = await gridToggle.evaluate(
      (element) => getComputedStyle(element).backgroundColor
    );
    const afterKeyboardToggle = await scene.screenshot();
    expect(afterKeyboardButtonColor).toBe(beforeButtonColor);
    expect(afterKeyboardToggle.equals(afterToolbarToggle)).toBe(false);
  });

  test('measurement mode supports snapping, repeated measurements, and tray management', async ({
    app,
  }) => {
    await app.waitForRender();

    // Collapse the file tree to give the 2D viewport maximum width — the
    // floating Measure tool panel (280px, bottom-right) can otherwise overlap
    // with the coordinate-based click positions used below.
    const hideBtn = app.page.locator('button[title="Hide file tree"]');
    if (await hideBtn.isVisible({ timeout: 1_000 }).catch(() => false)) {
      await hideBtn.click();
      await app.page.waitForTimeout(300);
    }

    await setMonacoValue(app.page, 'square([20, 10], center = true);');
    await app.triggerRender();
    await app.waitForRender();

    const root = app.page.getByTestId('preview-2d-root');
    const viewport = app.page.getByTestId('preview-2d-viewport');
    const box = await viewport.boundingBox();
    expect(box).not.toBeNull();

    await viewport.hover({ position: { x: box!.width * 0.35, y: box!.height * 0.5 } });
    await expect(app.page.getByTestId('preview-2d-coordinate-readout')).toBeVisible();

    await app.page.getByTestId('preview-2d-tool-measure').click();
    await expect(app.page.getByTestId('preview-2d-measure-help')).toBeVisible();

    // Use page.mouse for measurement interactions — measurement labels and
    // overlays can intercept Playwright's locator actionability checks, causing
    // flaky timeouts. Raw mouse events dispatch at absolute coordinates and
    // always reach the viewport's pointer handlers.
    const abs = (rx: number, ry: number) => ({
      x: box!.x + box!.width * rx,
      y: box!.y + box!.height * ry,
    });

    await app.page.mouse.click(abs(0.35, 0.5).x, abs(0.35, 0.5).y);
    await app.page.mouse.move(abs(0.65, 0.5).x, abs(0.65, 0.5).y);
    await expect(app.page.getByTestId('preview-2d-measurement-readout')).toBeVisible();
    await app.page.mouse.click(abs(0.65, 0.5).x, abs(0.65, 0.5).y);

    await expect(app.page.getByTestId('preview-2d-measurements-tray')).toBeVisible();
    await expect(app.page.getByTestId('preview-2d-measurement-readout')).toBeHidden();

    // Second measurement in the upper-left quadrant, clear of overlays.
    await app.page.mouse.click(abs(0.25, 0.25).x, abs(0.25, 0.25).y);
    await app.page.mouse.move(abs(0.45, 0.25).x, abs(0.45, 0.25).y);
    await app.page.mouse.click(abs(0.45, 0.25).x, abs(0.45, 0.25).y);

    const measurementItems = app.page.getByTestId('preview-2d-measurement-list-item');
    const countBeforeClear = await measurementItems.count();
    expect(countBeforeClear).toBeGreaterThanOrEqual(2);

    await app.page.getByTestId('preview-2d-clear-measurements').click();
    await expect(measurementItems).toHaveCount(0);

    await app.focus2DViewer();
    await app.page.keyboard.press('Escape');
    await app.page.keyboard.press('Escape');
    await expect(app.page.getByTestId('preview-2d-measure-help')).toBeHidden();
  });
});
