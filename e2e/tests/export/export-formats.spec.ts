import { test, expect } from '../../fixtures/app.fixture';
import { setMonacoValue } from '../../helpers/editor';

const cubeCode = 'cube([10, 10, 10]);';
const svgCode = 'square([10, 10]);';

/**
 * Open the Radix Select dropdown in the export dialog and pick a format.
 * Uses stable data-testid attributes on the trigger and each option item.
 */
async function selectExportFormat(page: import('@playwright/test').Page, value: string) {
  await page.getByTestId('export-format-select').click();
  await page.getByTestId(`format-option-${value}`).click();
}

test('export dialog opens', async ({ app }) => {
  await setMonacoValue(app.page, cubeCode);
  await app.triggerRender();
  await app.waitForRender();

  await app.openExportDialog();
  const dialog = app.page.locator('[data-testid="export-dialog"]');
  await expect(dialog.getByRole('heading', { name: 'Export Model' })).toBeVisible();
});

test('export dialog shows 3D format options for a 3D design', async ({ app }) => {
  await setMonacoValue(app.page, cubeCode);
  await app.triggerRender();
  await app.waitForRender();

  await app.openExportDialog();

  const trigger = app.page.getByTestId('export-format-select');
  await expect(trigger).toBeVisible();

  // Open the dropdown — only 3D formats should be shown for a 3D design
  await trigger.click();
  await expect(app.page.getByTestId('format-option-stl')).toBeVisible();
  await expect(app.page.getByTestId('format-option-obj')).toBeVisible();
  await expect(app.page.getByTestId('format-option-svg')).not.toBeVisible();

  await app.page.keyboard.press('Escape');
});

test('export dialog shows 2D format options for a 2D design', async ({ app }) => {
  await setMonacoValue(app.page, svgCode);
  await app.triggerRender();
  await app.waitForRender();

  await app.openExportDialog();

  const trigger = app.page.getByTestId('export-format-select');
  await expect(trigger).toBeVisible();

  // Open the dropdown — only 2D formats should be shown for a 2D design
  await trigger.click();
  await expect(app.page.getByTestId('format-option-svg')).toBeVisible();
  await expect(app.page.getByTestId('format-option-dxf')).toBeVisible();
  await expect(app.page.getByTestId('format-option-stl')).not.toBeVisible();

  await app.page.keyboard.press('Escape');
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
  await selectExportFormat(app.page, 'stl');

  // showSaveFilePicker opens a native OS dialog Playwright cannot drive.
  // Remove it so fileExport falls back to the programmatic a.click() path,
  // which fires the download event that Playwright can observe.
  await app.page.evaluate(() => {
    delete (window as any).showSaveFilePicker;
    delete (window as any).showOpenFilePicker;
  });

  const dialog = app.page.locator('[data-testid="export-dialog"]');
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
  await selectExportFormat(app.page, 'svg');

  await app.page.evaluate(() => {
    delete (window as any).showSaveFilePicker;
    delete (window as any).showOpenFilePicker;
  });

  const dialog = app.page.locator('[data-testid="export-dialog"]');
  const downloadPromise = app.page.waitForEvent('download');
  await dialog.getByRole('button', { name: /export/i }).click();
  await downloadPromise;
});

test('export OBJ format', async ({ app }) => {
  await setMonacoValue(app.page, cubeCode);
  await app.triggerRender();
  await app.waitForRender();

  await app.openExportDialog();
  await selectExportFormat(app.page, 'obj');

  await app.page.evaluate(() => {
    delete (window as any).showSaveFilePicker;
    delete (window as any).showOpenFilePicker;
  });

  const dialog = app.page.locator('[data-testid="export-dialog"]');
  const downloadPromise = app.page.waitForEvent('download');
  await dialog.getByRole('button', { name: /export/i }).click();
  await downloadPromise;
});
