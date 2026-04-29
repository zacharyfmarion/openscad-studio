import { test, expect } from '../../fixtures/app.fixture';

test.describe('Panel layout', () => {
  test('default layout has editor and preview', async ({ app }) => {
    await expect(app.page.locator('.monaco-editor').first()).toBeVisible();
    await app.waitForRender();
    await expect(app.previewCanvas3D).toBeVisible();
  });

  test('does not show NUX layout picker on first run', async ({ app }) => {
    // Clear stored state to simulate first run
    await app.page.evaluate(() => localStorage.clear());
    await app.page.reload();

    await expect(app.page.getByTestId('nux-layout-picker')).toHaveCount(0);
    await expect(app.page.getByTestId('welcome-screen')).toBeVisible({ timeout: 10_000 });
  });

  test('first run defaults to Edit workspace preset', async ({ app }) => {
    await app.page.evaluate(() => localStorage.clear());
    await app.page.reload();

    await app.page.getByTestId('welcome-start-empty-project').click();
    await expect(app.page.getByTestId('app-container')).toBeVisible({ timeout: 10_000 });

    const workspaceLayout = app.page.getByRole('group', { name: 'Workspace layout' });
    await expect(workspaceLayout.getByRole('button', { name: 'Edit' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
  });

  test('panels are resizable', async ({ app }) => {
    // Dockview uses .dv-sash elements as resize handles
    const sash = app.page.locator('.dv-sash').first();
    await expect(sash).toBeAttached({ timeout: 5000 });
  });
});
