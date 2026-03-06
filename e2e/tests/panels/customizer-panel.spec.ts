import { test, expect } from '../../fixtures/app.fixture';
import { setMonacoValue } from '../../helpers/editor';

test.describe('Customizer Panel', () => {
  async function ensureCustomizerVisible(page: import('@playwright/test').Page) {
    const customizerTab = page.locator('.dv-tab').filter({ hasText: 'Customizer' });
    if (!(await customizerTab.isVisible().catch(() => false))) {
      test.skip(true, 'Customizer tab not available in layout');
    }
    await customizerTab.click();
    await page.waitForTimeout(500);
  }

  test('shows no parameters for simple code', async ({ app }) => {
    await ensureCustomizerVisible(app.page);
    await setMonacoValue(app.page, 'cube(10);');
    await app.triggerRender();
    await app.waitForRender();
    await expect(app.page.getByText('No parameters found')).toBeVisible({ timeout: 5000 });
  });

  test('detects customizer parameters', async ({ app }) => {
    await ensureCustomizerVisible(app.page);

    const paramCode = [
      'width = 10; // [5:50]',
      'height = 20; // [5:100]',
      'cube([width, height, 5]);',
    ].join('\n');

    await setMonacoValue(app.page, paramCode);
    await app.triggerRender();
    await app.waitForRender();

    // Parser initializes asynchronously — wait for parameters to appear
    await expect(app.page.getByText('width').first()).toBeVisible({ timeout: 10_000 });
    await expect(app.page.getByText('height').first()).toBeVisible({ timeout: 5_000 });
  });

  test('shows parameter controls', async ({ app }) => {
    await ensureCustomizerVisible(app.page);

    const paramCode = [
      'width = 10; // [5:50]',
      'height = 20; // [5:100]',
      'cube([width, height, 5]);',
    ].join('\n');

    await setMonacoValue(app.page, paramCode);
    await app.triggerRender();
    await app.waitForRender();

    // Check for input controls (range sliders or number inputs)
    const controls = app.page.locator('input[type="range"], input[type="number"]');
    await expect(controls.first()).toBeVisible({ timeout: 10_000 });
  });
});
