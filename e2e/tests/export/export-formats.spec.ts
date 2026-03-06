import { test, expect } from '../../fixtures/app.fixture';
import { setMonacoValue, getMonacoValue } from '../../helpers/editor';

const cubeCode = 'cube([10, 10, 10]);';
const svgCode = 'square([10, 10]);';

test('export dialog opens', async ({ app }) => {
  await setMonacoValue(app.page, cubeCode);
  await app.triggerRender();
  await app.waitForRender();

  await app.openExportDialog();
  const dialog = app.page.locator('[data-testid="export-dialog"]');
  await expect(dialog.getByRole('heading', { name: 'Export Model' })).toBeVisible();
});

test('export dialog shows format options', async ({ app }) => {
  await app.openExportDialog();

  const dialog = app.page.locator('[data-testid="export-dialog"]');
  const formatSelect = dialog.getByRole('combobox');

  await expect(formatSelect).toBeVisible();
  await expect(formatSelect.locator('option')).toContainText(['STL', 'OBJ', 'SVG']);
});

test('export dialog can be closed', async ({ app }) => {
  await app.openExportDialog();
  const dialog = app.page.locator('[data-testid="export-dialog"]');
  await dialog.getByRole('button', { name: /cancel/i }).click();
  await expect(dialog).toBeHidden();
});

test('export STL triggers download', async ({ app }) => {
  await setMonacoValue(app.page, cubeCode);
  await app.triggerRender();
  await app.waitForRender();

  await app.openExportDialog();

  const dialog = app.page.locator('[data-testid="export-dialog"]');
  const formatSelect = dialog.getByRole('combobox');
  await formatSelect.selectOption('stl');

  const downloadPromise = app.page.waitForEvent('download');
  await dialog.getByRole('button', { name: /export/i }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toContain('.stl');
});

test('export with no rendered model shows enabled button', async ({ app }) => {
  // Even with no rendered model, the export button is always enabled
  // (the app allows attempting export regardless of render state)
  await app.openExportDialog();
  const dialog = app.page.locator('[data-testid="export-dialog"]');
  const exportButton = dialog.getByRole('button', { name: /export/i });

  // Export button should be enabled (app design choice)
  await expect(exportButton).toBeEnabled();
});

test('export SVG format', async ({ app }) => {
  await setMonacoValue(app.page, svgCode);
  await app.triggerRender();
  await app.waitForRender();

  await app.openExportDialog();
  const dialog = app.page.locator('[data-testid="export-dialog"]');
  const formatSelect = dialog.getByRole('combobox');
  await formatSelect.selectOption('svg');

  const downloadPromise = app.page.waitForEvent('download');
  await dialog.getByRole('button', { name: /export/i }).click();
  await downloadPromise;
});

test('export OBJ format', async ({ app }) => {
  await setMonacoValue(app.page, cubeCode);
  await app.triggerRender();
  await app.waitForRender();

  await app.openExportDialog();
  const dialog = app.page.locator('[data-testid="export-dialog"]');
  const formatSelect = dialog.getByRole('combobox');
  await formatSelect.selectOption('obj');

  const downloadPromise = app.page.waitForEvent('download');
  await dialog.getByRole('button', { name: /export/i }).click();
  await downloadPromise;
});
