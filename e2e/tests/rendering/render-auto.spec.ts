import { test, expect } from '../../fixtures/app.fixture';
import { setMonacoValue } from '../../helpers/editor';
import type { Page } from '@playwright/test';

/**
 * Toggle the Auto-Render on Idle setting.
 * The Toggle component renders a visually-hidden checkbox inside a <label>.
 * Clicking the <label> (not the hidden checkbox) reliably toggles the state.
 */
async function setAutoRender(page: Page, enabled: boolean) {
  // Open settings > Editor
  await page.keyboard.press('Meta+,');
  await page.getByText('Appearance').first().waitFor({ state: 'visible' });
  await page.getByRole('button', { name: /^Editor$/ }).click();
  await page.getByText('Auto-Render on Idle').waitFor({ state: 'visible' });

  // Navigate: "Auto-Render on Idle" text → parent row → find the Toggle's <label>
  const row = page.getByText('Auto-Render on Idle').locator('..').locator('..');
  const checkbox = row.locator('input[type="checkbox"]');
  const toggleLabel = row.locator('label').last();

  const isChecked = await checkbox.isChecked().catch(() => false);

  if ((enabled && !isChecked) || (!enabled && isChecked)) {
    await toggleLabel.click({ force: true });
    // Verify the toggle actually changed
    await page.waitForTimeout(200);
  }

  // Close settings
  await page.getByTestId('settings-close-button').click();
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
