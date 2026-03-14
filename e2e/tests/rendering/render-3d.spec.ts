import { test, expect } from '../../fixtures/app.fixture';
import { setMonacoValue } from '../../helpers/editor';
import { readFixture } from '../../helpers/platform';

type PreviewState = {
  currentFits: boolean;
  fitCount: number;
  maxDim: number | null;
  orthographic: boolean;
  cameraFar: number | null;
  cameraZoom: number | null;
  gridCellSize: number | null;
  gridSectionSize: number | null;
  axisExtent: number | null;
  axisMinorStep: number | null;
  axisMajorStep: number | null;
  axisLabelStep: number | null;
  axesVisible: boolean;
  axisLabelsVisible: boolean;
  cameraPosition: [number, number, number] | null;
  cameraTarget: [number, number, number] | null;
};

function vectorDistance(a: [number, number, number] | null, b: [number, number, number] | null) {
  if (!a || !b) {
    return 0;
  }

  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  const dz = a[2] - b[2];

  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

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

  test('right drag pans the camera target', async ({ app }) => {
    await app.waitForRender();
    await app.page.waitForFunction(() => {
      const preview = (window as any).__TEST_PREVIEW__;
      return preview?.cameraTarget && preview?.cameraPosition;
    });

    const beforePan = (await app.page.evaluate(() => (window as any).__TEST_PREVIEW__)) as PreviewState;
    const canvas = app.previewCanvas3D;
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();

    if (box) {
      const centerX = box.x + box.width / 2;
      const centerY = box.y + box.height / 2;

      await app.page.mouse.move(centerX, centerY);
      await app.page.mouse.down({ button: 'right' });
      await app.page.mouse.move(centerX + 70, centerY + 35, { steps: 8 });
      await app.page.mouse.up({ button: 'right' });
      await app.page.waitForTimeout(800);
    }

    const afterPan = (await app.page.evaluate(() => (window as any).__TEST_PREVIEW__)) as PreviewState;

    expect(afterPan.orthographic).toBe(false);
    expect(vectorDistance(afterPan.cameraTarget, beforePan.cameraTarget)).toBeGreaterThan(0.5);
    expect(vectorDistance(afterPan.cameraPosition, beforePan.cameraPosition)).toBeGreaterThan(0.5);
  });

  test('shift plus left drag pans as a fallback', async ({ app }) => {
    await app.waitForRender();
    await app.page.waitForFunction(() => {
      const preview = (window as any).__TEST_PREVIEW__;
      return preview?.cameraTarget && preview?.cameraPosition;
    });
    const beforePan = (await app.page.evaluate(() => (window as any).__TEST_PREVIEW__)) as PreviewState;
    const canvas = app.previewCanvas3D;
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();

    if (box) {
      const centerX = box.x + box.width / 2;
      const centerY = box.y + box.height / 2;

      await app.page.keyboard.down('Shift');
      await app.page.mouse.move(centerX, centerY);
      await app.page.mouse.down({ button: 'left' });
      await app.page.mouse.move(centerX - 60, centerY + 25, { steps: 8 });
      await app.page.mouse.up({ button: 'left' });
      await app.page.keyboard.up('Shift');
      await app.page.waitForTimeout(800);
    }

    const afterPan = (await app.page.evaluate(() => (window as any).__TEST_PREVIEW__)) as PreviewState;

    expect(vectorDistance(afterPan.cameraTarget, beforePan.cameraTarget)).toBeGreaterThan(0.5);
  });

  test('controls hint can be dismissed and stays dismissed after reload', async ({ app }) => {
    await app.waitForRender();

    const hint = app.page.getByTestId('preview-controls-hint');
    const dismissButton = app.page.getByTestId('preview-controls-hint-dismiss');

    await expect(hint).toBeVisible();
    await dismissButton.click();
    await expect(hint).toBeHidden();

    await app.page.reload();
    await app.waitForRender();

    await expect(app.page.getByTestId('preview-controls-hint')).toBeHidden();
  });

  test('multiple objects render', async ({ app }) => {
    await app.waitForRender();
    await setMonacoValue(app.page, 'cube(10);\ntranslate([25, 0, 0]) sphere(r = 5, $fn = 24);');
    await app.focusEditor();
    await app.triggerRender();
    await app.waitForRender();
    await expect(app.previewCanvas3D).toBeVisible();
  });

  test('large models stay framed across projection changes', async ({ app }) => {
    await app.waitForRender();
    await setMonacoValue(app.page, 'cube([50, 50, 406.4]);');
    await app.focusEditor();
    await app.triggerRender();
    await app.waitForRender();

    await app.page.waitForFunction(() => {
      const preview = (window as any).__TEST_PREVIEW__;
      return preview && preview.maxDim !== null;
    });

    const initialState = await app.page.evaluate(() => (window as any).__TEST_PREVIEW__);

    expect(initialState.maxDim).toBeGreaterThan(400);
    expect(initialState.cameraFar).toBeGreaterThanOrEqual(2000);
    expect(initialState.fitCount).toBeGreaterThan(0);
    expect(initialState.orthographic).toBe(false);
    expect(initialState.axisExtent).toBeGreaterThanOrEqual(600);
    expect(initialState.axisMajorStep).toBeGreaterThanOrEqual(100);

    await app.page.getByTestId('preview-toggle-orthographic').click();
    await app.page.waitForTimeout(1000);

    const orthographicState = await app.page.evaluate(() => (window as any).__TEST_PREVIEW__);

    expect(orthographicState.orthographic).toBe(true);
    expect(orthographicState.fitCount).toBeGreaterThan(initialState.fitCount);
  });

  test('orthographic mode still zooms with the mouse wheel', async ({ app }) => {
    await app.waitForRender();
    await app.page.getByTestId('preview-toggle-orthographic').click();
    await app.page.waitForTimeout(800);
    await app.page.waitForFunction(() => {
      const preview = (window as any).__TEST_PREVIEW__;
      return preview?.orthographic && typeof preview?.cameraZoom === 'number';
    });

    const beforeZoom = (await app.page.evaluate(
      () => (window as any).__TEST_PREVIEW__
    )) as PreviewState;
    const box = await app.previewCanvas3D.boundingBox();
    expect(box).not.toBeNull();

    if (box) {
      await app.page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await app.page.mouse.wheel(0, -500);
      await app.page.waitForTimeout(800);
    }

    const afterZoom = (await app.page.evaluate(
      () => (window as any).__TEST_PREVIEW__
    )) as PreviewState;

    expect(afterZoom.orthographic).toBe(true);
    expect(afterZoom.cameraZoom).not.toBeNull();
    expect(beforeZoom.cameraZoom).not.toBeNull();
    expect(afterZoom.cameraZoom).toBeGreaterThan(beforeZoom.cameraZoom ?? 0);
  });

  test('viewer settings can hide the axes overlay', async ({ app }) => {
    await app.waitForRender();
    await app.openSettings();
    await app.page.getByRole('button', { name: 'Viewer', exact: true }).click();
    await app.page.getByLabel('Show axes').uncheck();
    await app.closeDialog();
    await app.page.waitForTimeout(500);
    await app.page.waitForFunction(() => {
      const preview = (window as any).__TEST_PREVIEW__;
      return preview && preview.axesVisible === false;
    });

    const previewState = (await app.page.evaluate(() => (window as any).__TEST_PREVIEW__)) as PreviewState;

    expect(previewState.axesVisible).toBe(false);
    expect(previewState.axisLabelsVisible).toBe(false);
  });

  test('viewer settings can hide axis labels while keeping axes visible', async ({ app }) => {
    await app.waitForRender();
    await app.openSettings();
    await app.page.getByRole('button', { name: 'Viewer', exact: true }).click();
    await app.page.getByLabel('Show axis labels').uncheck();
    await app.closeDialog();
    await app.page.waitForTimeout(500);
    await app.page.waitForFunction(() => {
      const preview = (window as any).__TEST_PREVIEW__;
      return preview && preview.axesVisible === true && preview.axisLabelsVisible === false;
    });

    const previewState = (await app.page.evaluate(() => (window as any).__TEST_PREVIEW__)) as PreviewState;

    expect(previewState.axesVisible).toBe(true);
    expect(previewState.axisLabelsVisible).toBe(false);
  });

  test('small model edits preserve the current panned framing when still visible', async ({ app }) => {
    await app.waitForRender();
    await setMonacoValue(app.page, 'cube([20, 20, 20]);');
    await app.focusEditor();
    await app.triggerRender();
    await app.waitForRender();
    await app.page.waitForFunction(() => {
      const preview = (window as any).__TEST_PREVIEW__;
      return preview?.cameraTarget && preview?.cameraPosition;
    });

    const canvas = app.previewCanvas3D;
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();

    if (box) {
      const centerX = box.x + box.width / 2;
      const centerY = box.y + box.height / 2;

      await app.page.mouse.move(centerX, centerY);
      await app.page.mouse.down({ button: 'right' });
      await app.page.mouse.move(centerX + 35, centerY + 18, { steps: 8 });
      await app.page.mouse.up({ button: 'right' });
      await app.page.waitForTimeout(800);
    }

    const beforeEditState = (await app.page.evaluate(
      () => (window as any).__TEST_PREVIEW__
    )) as PreviewState;

    await setMonacoValue(app.page, 'cube([21, 20, 20]);');
    await app.focusEditor();
    await app.triggerRender();
    await app.waitForRender();

    const afterEditState = (await app.page.evaluate(
      () => (window as any).__TEST_PREVIEW__
    )) as PreviewState;

    expect(afterEditState.currentFits).toBe(true);
    expect(afterEditState.fitCount).toBe(beforeEditState.fitCount);
    expect(vectorDistance(afterEditState.cameraTarget, beforeEditState.cameraTarget)).toBeLessThan(0.5);
  });

  test('large shrink changes reframe the model back down', async ({ app }) => {
    await app.waitForRender();
    await setMonacoValue(app.page, 'cube([20, 20, 300]);');
    await app.focusEditor();
    await app.triggerRender();
    await app.waitForRender();

    const tallState = await app.page.evaluate(() => (window as any).__TEST_PREVIEW__);

    await setMonacoValue(app.page, 'cube([20, 20, 60]);');
    await app.focusEditor();
    await app.triggerRender();
    await app.waitForRender();
    await app.page.waitForTimeout(800);

    const shorterState = await app.page.evaluate(() => (window as any).__TEST_PREVIEW__);

    expect(shorterState.maxDim).toBeLessThan(tallState.maxDim);
    expect(shorterState.fitCount).toBeGreaterThan(tallState.fitCount);
    expect(shorterState.axisExtent).toBeLessThan(tallState.axisExtent);
    expect(shorterState.axisMajorStep).toBeLessThanOrEqual(tallState.axisMajorStep);
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
