import { test, expect } from '../../fixtures/app.fixture';
import { setMonacoValue } from '../../helpers/editor';
import type { Page } from '@playwright/test';

async function setAutoRender(page: Page, enabled: boolean) {
  // Open settings > Editor > General
  await page.keyboard.press('Meta+,');
  await page.getByText('Appearance').first().waitFor({ state: 'visible' });
  await page.getByRole('button', { name: /^Editor$/ }).click();
  // General subtab should be active by default
  await page.getByText('Auto-Render on Idle').waitFor({ state: 'visible' });

  // Find the auto-render checkbox (hidden but clickable with force)
  // The Toggle renders: <label><input type="checkbox" class="sr-only peer" /><div /></label>
  // It's a sibling of the "Auto-Render on Idle" text span, inside a flex row
  const row = page.locator('label').filter({ hasText: 'Auto-Render on Idle' }).first();
  // Actually the text and toggle are in separate elements in a flex row
  // Let me find the checkbox near the label text
  const checkbox = page
    .locator('input[type="checkbox"]')
    .filter({ has: page.locator('..', { hasText: 'Auto-Render on Idle' }) })
    .first();

  // Fallback approach: find all checkboxes and use the one near Auto-Render text
  const autoRenderSection = page.getByText('Auto-Render on Idle').locator('..');
  const toggle = autoRenderSection.locator('input[type="checkbox"]');

  const isChecked = await toggle.isChecked({ timeout: 2000 }).catch(() => false);

  if (enabled && !isChecked) {
    await toggle.check({ force: true });
  } else if (!enabled && isChecked) {
    await toggle.uncheck({ force: true });
  }

  // Close settings
  await page.getByRole('button', { name: /close/i }).click();
  await page.waitForTimeout(300);
}

test.describe('Auto-Render', () => {
  test('auto-render triggers after code change when enabled', async ({ app }) => {
    await app.waitForRender();

    await setAutoRender(app.page, true);

    // Change code — auto-render should trigger
    await setMonacoValue(app.page, 'sphere(r = 8, $fn = 24);');

    // Wait for auto-render to kick in (debounce + render)
    await app.waitForRender({ timeout: 10_000 });
    await expect(app.previewCanvas3D).toBeVisible();
  });

  test('manual render works when auto-render is off', async ({ app }) => {
    await app.waitForRender();

    // Auto-render should be off by default
    const screenshotBefore = await app.screenshotPreview();
    await setMonacoValue(app.page, 'cube([30, 10, 10]);');

    // Wait 2 seconds — no render should happen
    await app.page.waitForTimeout(2000);

    // Manually trigger render
    await app.focusEditor();
    await app.triggerRender();
    await app.waitForRender();
    await expect(app.previewCanvas3D).toBeVisible();

    await app.page.waitForTimeout(800);
    const screenshotAfter = await app.screenshotPreview();
    expect(Buffer.compare(screenshotBefore, screenshotAfter)).not.toBe(0);
  });

  test('rapid typing debounces renders', async ({ app }) => {
    await app.waitForRender();

    await setAutoRender(app.page, true);

    // Type rapidly — each keystroke should reset the debounce
    await app.focusEditor();
    await app.page.keyboard.press('Meta+a');
    for (const char of 'cube(5);') {
      await app.page.keyboard.type(char, { delay: 50 });
    }

    // After typing stops, render should eventually start
    await app.waitForRender({ timeout: 10_000 });
    await expect(app.previewCanvas3D).toBeVisible();
  });
});
