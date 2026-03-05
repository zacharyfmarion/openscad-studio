import { test, expect } from '../../fixtures/app.fixture';
import { setMonacoValue } from '../../helpers/editor';

test('default layout has editor and preview', async ({ app }) => {
  await setMonacoValue(app.page, 'cube(5);');
  await app.triggerRender();
  await expect(app.page.locator('.monaco-editor')).toBeVisible();
  await expect(app.page.locator('canvas[data-engine]')).toBeVisible();
});

test('NUX layout picker shown on first run', async ({ app }) => {
  await app.page.evaluate(() => localStorage.clear());
  await app.page.reload();
  await expect(app.page.getByText(/choose your workspace layout/i)).toBeVisible();
});

test('panels are resizable', async ({ app }) => {
  // Dockview renders sash (resize handle) elements between panels
  const resizeHandles = app.page.locator('.sash');
  await expect(resizeHandles.first()).toBeVisible();
});
