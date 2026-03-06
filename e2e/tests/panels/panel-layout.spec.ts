import { test, expect } from '../../fixtures/app.fixture';

test.describe('Panel layout', () => {
  test('default layout has editor and preview', async ({ app }) => {
    await expect(app.page.locator('.monaco-editor').first()).toBeVisible();
    await app.waitForRender();
    await expect(app.previewCanvas3D).toBeVisible();
  });

  test('NUX layout picker shown on first run', async ({ app }) => {
    // Clear stored state to simulate first run
    await app.page.evaluate(() => localStorage.clear());
    await app.page.reload();

    // Layout picker should be shown
    await expect(app.page.getByText(/choose your workspace layout/i)).toBeVisible({
      timeout: 10_000,
    });
  });

  test('panels are resizable', async ({ app }) => {
    // Dockview uses .dv-sash elements as resize handles
    const sash = app.page.locator('.dv-sash').first();
    await expect(sash).toBeAttached({ timeout: 5000 });
  });
});
