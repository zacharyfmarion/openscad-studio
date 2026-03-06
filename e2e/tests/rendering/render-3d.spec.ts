import { test, expect } from '../../fixtures/app.fixture';
import { setMonacoValue } from '../../helpers/editor';
import { readFixture } from '../../helpers/platform';

test.describe('3D Rendering', () => {
  test('renders default cube on load', async ({ app }) => {
    // Default content is cube([10,10,10]) — should render automatically
    await app.waitForRender({ timeout: 30_000 });
    await expect(app.previewCanvas3D).toBeVisible();
  });

  test('renders sphere', async ({ app }) => {
    await app.waitForRender();
    await setMonacoValue(app.page, 'sphere(r = 5, $fn = 32);');
    await app.focusEditor();
    await app.triggerRender();
    await app.waitForRender();
    await expect(app.previewCanvas3D).toBeVisible();
  });

  test('renders boolean operations', async ({ app }) => {
    await app.waitForRender();
    const code = readFixture('boolean-ops.scad');
    await setMonacoValue(app.page, code);
    await app.focusEditor();
    await app.triggerRender();
    await app.waitForRender();
    await expect(app.previewCanvas3D).toBeVisible();
  });

  test('renders transformations', async ({ app }) => {
    await app.waitForRender();
    const code = readFixture('transformations.scad');
    await setMonacoValue(app.page, code);
    await app.focusEditor();
    await app.triggerRender();
    await app.waitForRender();
    await expect(app.previewCanvas3D).toBeVisible();
  });

  test('renders complex model', async ({ app }) => {
    test.setTimeout(60_000);
    await app.waitForRender();
    const code = readFixture('complex-model.scad');
    await setMonacoValue(app.page, code);
    await app.focusEditor();
    await app.triggerRender();
    await app.waitForRender({ timeout: 45_000 });
    await expect(app.previewCanvas3D).toBeVisible();
  });

  test('preview updates when code changes', async ({ app }) => {
    // Render default cube first
    await app.waitForRender();
    await app.page.waitForTimeout(1000); // Let Three.js fully stabilize
    const screenshotA = await app.screenshotPreview();

    // Change to a different shape
    await setMonacoValue(app.page, 'cylinder(h = 20, r = 6, $fn = 24);');
    await app.focusEditor();
    await app.triggerRender();
    await app.waitForRender();
    await app.page.waitForTimeout(1500); // Extra time for Three.js to render new geometry
    const screenshotB = await app.screenshotPreview();

    // Screenshots should differ (different geometry)
    expect(Buffer.compare(screenshotA, screenshotB)).not.toBe(0);
  });

  test('orbit controls respond to mouse interaction', async ({ app }) => {
    await app.waitForRender();
    await app.page.waitForTimeout(1000);
    const screenshotBefore = await app.screenshotPreview();

    // Simulate mouse drag on the canvas to orbit
    const canvas = app.previewCanvas3D;
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();
    if (box) {
      const centerX = box.x + box.width / 2;
      const centerY = box.y + box.height / 2;
      // Use pointer events which R3F/drei CameraControls expects
      await app.page.mouse.move(centerX, centerY);
      await app.page.mouse.down({ button: 'left' });
      // Drag in an arc to orbit
      for (let i = 1; i <= 15; i++) {
        await app.page.mouse.move(centerX + i * 8, centerY + i * 4, { steps: 1 });
        await app.page.waitForTimeout(30);
      }
      await app.page.mouse.up({ button: 'left' });
      await app.page.waitForTimeout(800);
    }

    const screenshotAfter = await app.screenshotPreview();
    expect(Buffer.compare(screenshotBefore, screenshotAfter)).not.toBe(0);
  });

  test('multiple objects render', async ({ app }) => {
    await app.waitForRender();
    await setMonacoValue(app.page, 'cube(10);\ntranslate([25, 0, 0]) sphere(r = 5, $fn = 24);');
    await app.focusEditor();
    await app.triggerRender();
    await app.waitForRender();
    await expect(app.previewCanvas3D).toBeVisible();
  });

  test('empty code shows no preview or keeps last render', async ({ app }) => {
    await app.waitForRender();
    await setMonacoValue(app.page, '');
    await app.focusEditor();
    await app.triggerRender();
    await app.page.waitForTimeout(3000);

    // After rendering empty code, expect one of:
    // 1. Empty state shown ([data-testid="preview-empty"])
    // 2. Error state shown ([data-testid="preview-error"])
    // 3. Canvas still visible (app keeps last render) — this is also acceptable
    const previewEmpty = app.page.locator('[data-testid="preview-empty"]');
    const previewError = app.page.locator('[data-testid="preview-error"]');
    const canvas = app.previewCanvas3D;

    const isEmpty = await previewEmpty.isVisible().catch(() => false);
    const isError = await previewError.isVisible().catch(() => false);
    const isCanvasVisible = await canvas.isVisible().catch(() => false);

    // At least one of these states should be true
    expect(isEmpty || isError || isCanvasVisible).toBe(true);
  });
});
