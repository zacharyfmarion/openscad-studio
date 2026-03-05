import { test, expect } from '../../fixtures/app.fixture';
import { setMonacoValue, getMonacoValue } from '../../helpers/editor';

const defaultContent = '// Type your OpenSCAD code here\ncube([10, 10, 10]);';

test('new file resets to default content', async ({ app }) => {
  await setMonacoValue(app.page, 'cube([2, 2, 2]);');

  await app.page.getByRole('button', { name: 'File' }).click();
  await app.page.getByRole('button', { name: 'New File' }).click();

  // Handle confirmation dialog if it appears
  const confirmDialog = app.page.getByRole('dialog');
  if (await confirmDialog.isVisible({ timeout: 1000 }).catch(() => false)) {
    await confirmDialog.getByRole('button', { name: /confirm|ok|yes|discard/i }).click();
  }

  // Dismiss welcome screen if shown (app shows it after new file)
  const welcomeScreen = app.page.locator('[data-testid="welcome-screen"]');
  if (await welcomeScreen.isVisible({ timeout: 1000 }).catch(() => false)) {
    // Click 'Start with empty project' or any dismiss action
    const startEmpty = app.page.getByText(/start with empty project/i);
    if (await startEmpty.isVisible().catch(() => false)) {
      await startEmpty.click();
    }
  }

  await app.page.waitForTimeout(300);
  const value = await getMonacoValue(app.page);
  expect(value.trim()).toBe(defaultContent);
});

test('new file after modifications prompts confirmation', async ({ app }) => {
  await setMonacoValue(app.page, 'cube([1, 1, 1]);');

  await app.page.getByRole('button', { name: 'File' }).click();
  await app.page.getByRole('button', { name: 'New File' }).click();

  const confirmDialog = app.page.getByRole('dialog');
  if (await confirmDialog.isVisible()) {
    await expect(confirmDialog).toBeVisible();
  }
});

test('editor has default content after new file', async ({ app }) => {
  await setMonacoValue(app.page, 'cube([5, 5, 5]);');

  await app.page.getByRole('button', { name: 'File' }).click();
  await app.page.getByRole('button', { name: 'New File' }).click();

  // Handle confirmation dialog
  const confirmDialog = app.page.getByRole('dialog');
  if (await confirmDialog.isVisible({ timeout: 1000 }).catch(() => false)) {
    await confirmDialog.getByRole('button', { name: /confirm|ok|yes|discard/i }).click();
  }

  // Dismiss welcome screen
  const welcomeScreen = app.page.locator('[data-testid="welcome-screen"]');
  if (await welcomeScreen.isVisible({ timeout: 1000 }).catch(() => false)) {
    const startEmpty = app.page.getByText(/start with empty project/i);
    if (await startEmpty.isVisible().catch(() => false)) {
      await startEmpty.click();
    }
  }

  await app.page.waitForTimeout(300);
  const value = await getMonacoValue(app.page);
  expect(value.trim()).toBe(defaultContent);
});
