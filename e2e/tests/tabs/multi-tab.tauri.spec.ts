import { test, expect } from '../../fixtures/app.fixture';
import { setMonacoValue, getMonacoValue } from '../../helpers/editor';

test.describe('Multi-tab (Tauri)', () => {
  test('new tab via shortcut', async ({ app }) => {
    const tabs = app.page.locator('span.truncate');
    const beforeCount = await tabs.count();
    await app.page.keyboard.press('Meta+T');
    await expect(tabs).toHaveCount(beforeCount + 1);
  });

  test('tabs preserve content', async ({ app }) => {
    const tabs = app.page.locator('span.truncate');
    const beforeCount = await tabs.count();
    const initial = await getMonacoValue(app.page);
    await app.page.keyboard.press('Meta+T');
    await expect(tabs).toHaveCount(beforeCount + 1);
    await setMonacoValue(app.page, 'sphere(5);');
    await tabs.nth(0).click();
    const firstTabValue = await getMonacoValue(app.page);
    expect(firstTabValue).toContain(initial.trim());
  });

  test('close tab', async ({ app }) => {
    const tabs = app.page.locator('span.truncate');
    const beforeCount = await tabs.count();
    await app.page.keyboard.press('Meta+T');
    await expect(tabs).toHaveCount(beforeCount + 1);
    await app.page.keyboard.press('Meta+W');
    await expect(tabs).toHaveCount(beforeCount);
  });

  test('tab shows unsaved indicator', async ({ app }) => {
    const tabs = app.page.locator('span.truncate');
    if ((await tabs.count()) === 0) {
      await app.page.keyboard.press('Meta+T');
    }
    await setMonacoValue(app.page, 'sphere(7);');
    const unsavedDot = app.page.locator('.h-2.w-2, .w-2.h-2');
    await expect(unsavedDot.first()).toBeVisible();
  });

  test('independent diagnostics per tab', async ({ app }) => {
    const tabs = app.page.locator('span.truncate');
    await setMonacoValue(app.page, 'cube(');
    await app.triggerRender();
    await app.waitForRender();
    await expect(app.page.getByText(/error/i)).toBeVisible();

    const beforeCount = await tabs.count();
    await app.page.keyboard.press('Meta+T');
    await expect(tabs).toHaveCount(beforeCount + 1);
    await setMonacoValue(app.page, 'cube([2, 2, 2]);');
    await app.triggerRender();
    await app.waitForRender();
    await expect(app.page.getByText(/error/i)).not.toBeVisible();

    await tabs.nth(0).click();
    await expect(app.page.getByText(/error/i)).toBeVisible();
  });
});
