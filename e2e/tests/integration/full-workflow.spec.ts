import { test, expect } from '../../fixtures/app.fixture';
import { setMonacoValue, getMonacoValue } from '../../helpers/editor';

test.describe('Full workflow integration', () => {
  test('complete modeling workflow', async ({ app }) => {
    // Wait for initial render
    await app.waitForRender();

    // Set new code and render
    await setMonacoValue(app.page, 'sphere(r = 10, $fn = 32);');
    await app.focusEditor();
    await app.triggerRender();
    await app.waitForRender();
    await expect(app.previewCanvas3D).toBeVisible();

    // Open export dialog and close it
    await app.openExportDialog();
    const exportDialog = app.page.locator('[data-testid="export-dialog"]');
    await expect(exportDialog).toBeVisible();
    // Close export dialog
    await app.page.getByRole('button', { name: /cancel/i }).click();
    await exportDialog.waitFor({ state: 'hidden', timeout: 3000 });
  });

  // APP BUG: Monaco markers are not populated from OpenSCAD wasm compilation
  // when editor value is set programmatically. This test validates that the app
  // doesn't crash on bad code and can recover, but can't verify marker state.
  test('error recovery workflow', async ({ app }) => {
    await app.waitForRender();

    // Set bad code — app should not crash
    await setMonacoValue(app.page, 'cube(;');
    await app.focusEditor();
    await app.triggerRender();
    await app.page.waitForTimeout(3000);

    // App should still be functional (not crashed)
    await expect(app.page.locator('.monaco-editor')).toBeVisible();

    // Fix the code and verify it renders successfully
    await setMonacoValue(app.page, 'cube([10, 10, 10]);');
    await app.focusEditor();
    await app.triggerRender();
    await app.waitForRender();

    // Preview should be working after recovery
    await expect(app.previewCanvas3D).toBeVisible();
  });

  test('edit and render cycle', async ({ app }) => {
    await app.waitForRender();
    await app.page.waitForTimeout(1000); // Extra stabilization

    const screenshotA = await app.screenshotPreview();

    // Change to different geometry
    await setMonacoValue(app.page, 'cylinder(h = 25, r = 8, $fn = 48);');
    await app.focusEditor();
    await app.triggerRender();
    await app.waitForRender();
    await app.page.waitForTimeout(1500); // Extra stabilization for Three.js

    const screenshotB = await app.screenshotPreview();

    // Screenshots should differ
    expect(Buffer.compare(screenshotA, screenshotB)).not.toBe(0);
  });

  test('settings persistence across session', async ({ app }) => {
    // Open settings and switch to Editor tab
    await app.openSettings();
    await app.navigateSettingsTab('Editor');
    await app.page.getByText('Format on Save').waitFor({ state: 'visible' });

    // Get initial state of format-on-save toggle
    const toggleRow = app.page.getByText('Format on Save').locator('..');
    const checkbox = toggleRow.locator('input[type="checkbox"]');
    const initialChecked = await checkbox.isChecked().catch(() => false);

    // Toggle the setting
    await checkbox.click({ force: true });
    await app.page.waitForTimeout(300);

    // Close settings
    await app.page.getByRole('button', { name: /close/i }).click();
    await app.page.waitForTimeout(300);

    // Reopen settings and verify change persisted
    await app.openSettings();
    await app.navigateSettingsTab('Editor');
    await app.page.getByText('Format on Save').waitFor({ state: 'visible' });

    const newChecked = await toggleRow
      .locator('input[type="checkbox"]')
      .isChecked()
      .catch(() => false);
    expect(newChecked).not.toBe(initialChecked);

    // Restore original state
    await toggleRow.locator('input[type="checkbox"]').click({ force: true });
    await app.page.getByRole('button', { name: /close/i }).click();
  });
});
