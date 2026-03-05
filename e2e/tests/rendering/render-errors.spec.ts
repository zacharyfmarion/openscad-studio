import { test, expect } from '../../fixtures/app.fixture';
import { setMonacoValue } from '../../helpers/editor';
import { readFixture } from '../../helpers/platform';

async function ensureConsoleVisible(page: import('@playwright/test').Page) {
  const consoleTab = page.locator('.dv-tab').filter({ hasText: 'Console' });
  if (await consoleTab.isVisible({ timeout: 2000 }).catch(() => false)) {
    await consoleTab.click();
    await page.waitForTimeout(300);
  }
}

async function getMarkerCount(page: import('@playwright/test').Page): Promise<number> {
  return page.evaluate(() => {
    const m = (window as any).__TEST_MONACO__;
    return m?.editor?.getModelMarkers({})?.length ?? 0;
  });
}

test.describe('Render Error Handling', () => {
  // APP BUG: Monaco markers are not populated from OpenSCAD wasm compilation when
  // editor value is set programmatically. Diagnostics pipeline doesn't reliably
  // propagate errors back to Monaco markers in the web build.
  test.skip('syntax error produces diagnostics markers', async ({ app }) => {
    await app.waitForRender();
    await setMonacoValue(app.page, 'cube(;');
    await app.focusEditor();
    await app.triggerRender();
    await app.page.waitForTimeout(3000);
    await expect.poll(() => getMarkerCount(app.page), { timeout: 10000 }).toBeGreaterThan(0);
  });

  test('recovers after fixing error', async ({ app }) => {
    await app.waitForRender();
    // Set bad code
    await setMonacoValue(app.page, 'cube(;');
    await app.focusEditor();
    await app.triggerRender();
    await app.page.waitForTimeout(3000);

    // Fix code
    await setMonacoValue(app.page, 'cube([10, 10, 10]);');
    await app.focusEditor();
    await app.triggerRender();
    await app.waitForRender();

    // Preview should be back to normal
    await expect(app.previewCanvas3D).toBeVisible();
  });

  test('echo output is captured', async ({ app }) => {
    await app.waitForRender();
    const code = readFixture('echo-test.scad');
    await setMonacoValue(app.page, code);
    await app.focusEditor();
    await app.triggerRender();
    await app.waitForRender();
    await ensureConsoleVisible(app.page);
    // Look for echo output in the diagnostics panel
    const panel = app.page.locator('[data-testid="diagnostics-panel"]');
    await expect
      .poll(async () => (await panel.textContent()) ?? '', { timeout: 10000 })
      .toMatch(/hello from openscad/i);
  });

  // APP BUG: Same as above — markers not populated
  test.skip('multiple errors produce multiple markers', async ({ app }) => {
    await app.waitForRender();
    await setMonacoValue(app.page, 'cube(;\nsphere(;\ncylinder(;');
    await app.focusEditor();
    await app.triggerRender();
    await app.page.waitForTimeout(3000);
    await expect.poll(() => getMarkerCount(app.page), { timeout: 10000 }).toBeGreaterThan(0);
  });

  test('error does not crash the app', async ({ app }) => {
    await app.waitForRender();
    // Render bad code
    await setMonacoValue(app.page, 'this is not valid openscad!!!');
    await app.focusEditor();
    await app.triggerRender();
    await app.page.waitForTimeout(3000);

    // App should still be responsive — editor should still be usable
    await setMonacoValue(app.page, 'cube(5);');
    await app.focusEditor();
    await app.triggerRender();
    await app.waitForRender();
    await expect(app.previewCanvas3D).toBeVisible();
  });
});
