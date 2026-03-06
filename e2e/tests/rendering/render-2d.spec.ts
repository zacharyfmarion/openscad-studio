import { test, expect } from '../../fixtures/app.fixture';
import { setMonacoValue } from '../../helpers/editor';

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
    await setMonacoValue(
      app.page,
      'polygon(points = [[0,0],[10,0],[5,8]]);'
    );
    await app.triggerRender();
    await app.waitForRender();
    await expect(app.previewSvg2D).toBeVisible();
  });
});
