import { test, expect } from '../../fixtures/app.fixture';
import type { Page } from '@playwright/test';
import { setMonacoValue } from '../../helpers/editor';

async function ensureCustomizerVisible(page: Page) {
  const customizerTab = page.locator('.dv-tab').filter({ hasText: 'Customizer' });
  if (!(await customizerTab.count())) return false;
  if (await customizerTab.isVisible().catch(() => false)) {
    await customizerTab.first().click();
  }
  return true;
}

test('shows no parameters for simple code', async ({ app }) => {
  if (!(await ensureCustomizerVisible(app.page))) {
    test.skip(true, 'Customizer panel not available in Editor First layout');
  }
  await setMonacoValue(app.page, 'cube(10);');
  await app.triggerRender();
  await app.page.waitForTimeout(1000);
  await expect(app.page.getByText('No parameters found')).toBeVisible();
});

test('detects customizer parameters', async ({ app }) => {
  if (!(await ensureCustomizerVisible(app.page))) {
    test.skip(true, 'Customizer panel not available in Editor First layout');
  }
  await setMonacoValue(
    app.page,
    ['width = 10; // [5:50]', 'height = 20; // [5:100]', 'cube([width, height, 5]);'].join('\n')
  );
  await app.triggerRender();
  await app.page.waitForTimeout(1000);
  await expect(app.page.getByText('width')).toBeVisible();
  await expect(app.page.getByText('height')).toBeVisible();
});

test('shows parameter controls', async ({ app }) => {
  if (!(await ensureCustomizerVisible(app.page))) {
    test.skip(true, 'Customizer panel not available in Editor First layout');
  }
  await setMonacoValue(
    app.page,
    ['width = 10; // [5:50]', 'height = 20; // [5:100]', 'cube([width, height, 5]);'].join('\n')
  );
  await app.triggerRender();
  await app.page.waitForTimeout(1000);

  const controls = app.page.locator("input[type='range'], input[type='number']");
  await expect(controls.first()).toBeVisible();
});
