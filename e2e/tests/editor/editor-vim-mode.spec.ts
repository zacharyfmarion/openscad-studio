import { test, expect } from '../../fixtures/app.fixture';
import { getMonacoValue, waitForMonacoReady, typeInEditor } from '../../helpers/editor';

const enableVimMode = async (page: import('@playwright/test').Page) => {
  await waitForMonacoReady(page);
  await page.keyboard.press('Meta+,');
  await page.getByTestId('settings-nav-editor').click();
  // Click the Toggle label that wraps the vim-mode-toggle checkbox.
  // The Toggle component renders: <label><input data-testid="vim-mode-toggle" /><div /></label>
  await page.getByTestId('vim-mode-toggle').locator('..').click({ force: true });
  await expect(page.locator('.vim-status-bar')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
};

test.describe('editor vim mode', () => {
  test('vim mode can be enabled via settings', async ({ app }) => {
    await enableVimMode(app.page);
    await expect(app.page.locator('.vim-status-bar')).toBeVisible();
  });

  test('basic vim insert mode', async ({ app }) => {
    await enableVimMode(app.page);
    await app.page.evaluate(() => {
      const editor = (window as any).__TEST_EDITOR__;
      if (editor) editor.focus();
    });
    await app.page.keyboard.press('i');
    await typeInEditor(app.page, 'cube(2);');
    const value = await getMonacoValue(app.page);
    expect(value).toContain('cube(2);');
  });

  test('vim normal mode navigation', async ({ app }) => {
    await enableVimMode(app.page);
    await app.page.keyboard.press('Escape');
    await expect(app.page.locator('.vim-status-bar')).toContainText(/normal/i);
  });
});
