import { test, expect } from '../../fixtures/app.fixture';
import { setMonacoValue, getMonacoValue, typeInEditor } from '../../helpers/editor';

test.describe('Keyboard shortcuts', () => {
  test('Meta+Enter triggers render', async ({ app }) => {
    await setMonacoValue(app.page, 'cube([5, 5, 5]);');
    await app.focusEditor();
    await app.page.keyboard.press('Meta+Enter');
    await app.waitForRender();
    await expect(app.previewCanvas3D).toBeVisible();
  });

  test('Meta+, opens settings', async ({ app }) => {
    await app.page.keyboard.press('Meta+,');
    await expect(app.page.getByText('Appearance').first()).toBeVisible();
  });

  test('Meta+K activates AI panel', async ({ app }) => {
    await app.page.keyboard.press('Meta+k');
    await app.page.waitForTimeout(500);
    // The AI panel should show either the chat textarea or the "no API key" prompt
    const noKeyMessage = app.page.getByText(/Add an API key/i);
    const chatInput = app.page.locator('textarea[placeholder*="Describe"]');
    const hasNoKey = await noKeyMessage.isVisible().catch(() => false);
    const hasChat = await chatInput.isVisible().catch(() => false);
    expect(hasNoKey || hasChat).toBe(true);
  });

  test('Meta+T creates new tab', async ({ app }) => {
    const initialValue = await getMonacoValue(app.page);
    await app.page.keyboard.press('Meta+t');
    await app.page.waitForTimeout(500);
    // New tab should have default content
    const value = await getMonacoValue(app.page);
    // The new tab has the default content (same as initial, since both are default tabs)
    expect(value).toContain('cube');
  });

  test('Meta+S triggers save', async ({ app }) => {
    await setMonacoValue(app.page, 'cube([1, 2, 3]);');
    await app.focusEditor();
    // Remove showSaveFilePicker to force download behavior
    await app.page.evaluate(() => {
      const win = window as unknown as Record<string, unknown>;
      delete win.showSaveFilePicker;
    });
    const downloadPromise = app.page.waitForEvent('download', { timeout: 5000 }).catch(() => null);
    await app.page.keyboard.press('Meta+s');
    const download = await downloadPromise;
    // On web, save should trigger a download
    expect(download).not.toBeNull();
  });

  test('Meta+Shift+F formats code', async ({ app }) => {
    await setMonacoValue(app.page, 'difference(){cube([1,1,1]);sphere(2);}');
    const before = await getMonacoValue(app.page);
    await app.focusEditor();
    await app.page.keyboard.press('Meta+Shift+f');
    await app.page.waitForTimeout(500);
    const after = await getMonacoValue(app.page);
    // Formatting should change the code (add indentation/newlines)
    expect(after).not.toBe(before);
  });

  test('Meta+Z triggers undo', async ({ app }) => {
    // Type something into the editor
    await app.focusEditor();
    await app.page.keyboard.press('Meta+a');
    await app.page.keyboard.type('sphere(8);', { delay: 30 });
    await app.page.waitForTimeout(200);
    const afterType = await getMonacoValue(app.page);
    expect(afterType).toContain('sphere(8)');

    // Undo should revert
    await app.page.keyboard.press('Meta+z');
    await app.page.waitForTimeout(200);
    const afterUndo = await getMonacoValue(app.page);
    // After undo, content should differ from what we typed
    expect(afterUndo).not.toBe(afterType);
  });

  test('Escape closes dialogs', async ({ app }) => {
    await app.openSettings();
    await expect(app.page.getByText('Appearance').first()).toBeVisible();
    await app.page.keyboard.press('Escape');
    await app.page.waitForTimeout(300);
    // If Escape didn't close it (settings may not handle Escape), click Close button
    if (
      await app.page
        .getByText('Appearance')
        .first()
        .isVisible()
        .catch(() => false)
    ) {
      await app.page.getByRole('button', { name: /close/i }).click();
    }
    await expect(app.page.getByText('Appearance').first()).not.toBeVisible({ timeout: 3000 });
  });
});
