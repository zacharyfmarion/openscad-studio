import { test, expect } from '../../fixtures/app.fixture';
import { setMonacoValue, getMonacoValue } from '../../helpers/editor';

/**
 * Ensure the file tree sidebar is visible.
 */
async function ensureFileTreeVisible(page: import('@playwright/test').Page) {
  const newFileBtn = page.locator('button[title="New file"]');
  if (!(await newFileBtn.isVisible({ timeout: 1000 }).catch(() => false))) {
    // File tree is collapsed — expand it
    const expandBtn = page.locator('button[title="Show file tree"]');
    if (await expandBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
      await expandBtn.click();
      await page.waitForTimeout(300);
    }
  }
}

test.describe('Multi-file project', () => {
  test.setTimeout(60_000);

  test('new file appears in file tree and can be switched to', async ({ app }) => {
    await app.waitForRender();
    await ensureFileTreeVisible(app.page);

    // The default project has main.scad
    const fileTreePanel = app.page.locator('button[title="main.scad"]');
    await expect(fileTreePanel).toBeVisible();

    // Click "New file" button in file tree header
    await app.page.locator('button[title="New file"]').click();
    await app.page.waitForTimeout(500);

    // A rename input should appear for the new file
    const renameInput = app.page.getByTestId('rename-input');
    await expect(renameInput).toBeVisible();

    // Type a name and confirm
    await renameInput.fill('helper.scad');
    await renameInput.press('Enter');
    await app.page.waitForTimeout(500);

    // The new file should appear in the file tree
    const helperBtn = app.page.locator('button[title="helper.scad"]');
    await expect(helperBtn).toBeVisible();

    // Type content in the new file's editor
    await setMonacoValue(app.page, 'module my_helper() { sphere(5); }');
    await app.page.waitForTimeout(300);

    // Switch back to main.scad via file tree
    await app.page.locator('button[title="main.scad"]').click();
    await app.page.waitForTimeout(500);

    // Editor should show main.scad content
    const mainContent = await getMonacoValue(app.page);
    expect(mainContent).toContain('cube');

    // Switch to helper.scad and verify its content persists
    await helperBtn.click();
    await app.page.waitForTimeout(500);
    const helperContent = await getMonacoValue(app.page);
    expect(helperContent).toContain('my_helper');
  });

  test('render target stays on main.scad when editing another file', async ({ app }) => {
    await app.waitForRender();
    await ensureFileTreeVisible(app.page);

    // Add a secondary file via the "New file" button
    await app.page.locator('button[title="New file"]').click();
    await app.page.waitForTimeout(500);
    const renameInput = app.page.getByTestId('rename-input');
    await renameInput.fill('utils.scad');
    await renameInput.press('Enter');
    await app.page.waitForTimeout(500);

    // main.scad should still be the render target (shown with play icon)
    // The render target has a play icon with title="Render target"
    // Wait longer for the file tree to update with render target state
    const renderTargetIcon = app.page.locator('[title="Render target"]');
    await expect(renderTargetIcon).toBeVisible({ timeout: 10_000 });

    // The play icon should be on main.scad, not utils.scad
    const mainRow = app.page.locator('button[title="main.scad"]');
    const mainHasPlayIcon = mainRow.locator('[title="Render target"]');
    await expect(mainHasPlayIcon).toBeVisible({ timeout: 10_000 });

    // Edit in utils.scad — render should still use main.scad
    await setMonacoValue(app.page, 'module util_box() { cube(3); }');
    await app.page.waitForTimeout(300);

    // Trigger a render — it should render main.scad, not utils.scad
    await app.triggerRender();
    await app.waitForRender();

    // Preview should show the default cube (from main.scad), not an error
    await expect(app.previewCanvas3D).toBeVisible();
  });

  test('set render target via context menu', async ({ app }) => {
    await app.waitForRender();
    await ensureFileTreeVisible(app.page);

    // Create a second file
    await app.page.locator('button[title="New file"]').click();
    await app.page.waitForTimeout(500);
    const renameInput = app.page.getByTestId('rename-input');
    await renameInput.fill('alt.scad');
    await renameInput.press('Enter');
    await app.page.waitForTimeout(500);

    // Put renderable content in alt.scad
    await setMonacoValue(app.page, 'sphere(10);');
    await app.page.waitForTimeout(300);

    // Right-click alt.scad to open context menu
    const altBtn = app.page.locator('button[title="alt.scad"]');
    await altBtn.click({ button: 'right' });
    await app.page.waitForTimeout(300);

    // Click "Set as Render Target"
    const menuItem = app.page.getByText('Set as Render Target');
    await expect(menuItem).toBeVisible();
    await menuItem.click();
    await app.page.waitForTimeout(500);

    // alt.scad should now show the render target icon
    const altRenderTarget = altBtn.locator('[title="Render target"]');
    await expect(altRenderTarget).toBeVisible({ timeout: 10_000 });

    // main.scad should no longer be the render target
    const mainBtn = app.page.locator('button[title="main.scad"]');
    const mainRenderTarget = mainBtn.locator('[title="Render target"]');
    await expect(mainRenderTarget).toBeHidden({ timeout: 10_000 });
  });

  test('delete file via context menu', async ({ app }) => {
    await app.waitForRender();
    await ensureFileTreeVisible(app.page);

    // Create a file to delete
    await app.page.locator('button[title="New file"]').click();
    await app.page.waitForTimeout(500);
    const renameInput = app.page.getByTestId('rename-input');
    await renameInput.fill('temp.scad');
    await renameInput.press('Enter');
    await app.page.waitForTimeout(500);

    const tempBtn = app.page.locator('button[title="temp.scad"]');
    await expect(tempBtn).toBeVisible();

    // Handle confirm dialog for delete
    app.page.on('dialog', async (dialog) => {
      await dialog.accept();
    });

    // Right-click and delete
    await tempBtn.click({ button: 'right' });
    await app.page.waitForTimeout(300);
    await app.page.getByText('Delete').click();
    await app.page.waitForTimeout(500);

    // File should be gone
    await expect(tempBtn).toBeHidden();

    // main.scad should still be there
    await expect(app.page.locator('button[title="main.scad"]')).toBeVisible();
  });

  test('rename file via context menu', async ({ app }) => {
    await app.waitForRender();
    await ensureFileTreeVisible(app.page);

    // Create a file to rename
    await app.page.locator('button[title="New file"]').click();
    await app.page.waitForTimeout(500);
    const renameInput = app.page.getByTestId('rename-input');
    await renameInput.fill('old_name.scad');
    await renameInput.press('Enter');
    await app.page.waitForTimeout(500);

    const oldBtn = app.page.locator('button[title="old_name.scad"]');
    await expect(oldBtn).toBeVisible();

    // Right-click and rename
    await oldBtn.click({ button: 'right' });
    await app.page.waitForTimeout(300);
    await app.page.getByText('Rename').click();
    await app.page.waitForTimeout(300);

    // Rename input should appear
    const renameInput2 = app.page.getByTestId('rename-input');
    await expect(renameInput2).toBeVisible();
    await renameInput2.fill('new_name.scad');
    await renameInput2.press('Enter');
    await app.page.waitForTimeout(500);

    // Old name gone, new name visible
    await expect(app.page.locator('button[title="old_name.scad"]')).toBeHidden();
    await expect(app.page.locator('button[title="new_name.scad"]')).toBeVisible();
  });

  test('multi-file include resolution works', async ({ app }) => {
    await app.waitForRender();
    await ensureFileTreeVisible(app.page);

    // Create a helper file
    await app.page.locator('button[title="New file"]').click();
    await app.page.waitForTimeout(500);
    const renameInput = app.page.getByTestId('rename-input');
    await renameInput.fill('shapes.scad');
    await renameInput.press('Enter');
    await app.page.waitForTimeout(500);

    // Add a module to shapes.scad
    await setMonacoValue(app.page, 'module my_sphere() { sphere(10); }');
    await app.page.waitForTimeout(300);

    // Switch to main.scad and use the module
    await app.page.locator('button[title="main.scad"]').click();
    await app.page.waitForTimeout(500);
    await setMonacoValue(app.page, 'use <shapes.scad>\nmy_sphere();');
    await app.page.waitForTimeout(300);

    // Render — should succeed using the project's multi-file resolution
    await app.triggerRender();
    await app.waitForRender();

    // Preview should show the sphere without include errors
    await expect(app.previewCanvas3D).toBeVisible();
  });

  test('saving a nested file preserves its folder structure', async ({ app }) => {
    await app.waitForRender();
    await ensureFileTreeVisible(app.page);

    // Create a file inside a subfolder by typing a path with slash
    await app.page.locator('button[title="New file"]').click();
    await app.page.waitForTimeout(500);
    const renameInput = app.page.getByTestId('rename-input');
    await renameInput.fill('lib/shapes.scad');
    await renameInput.press('Enter');
    await app.page.waitForTimeout(500);

    // A "lib" folder should appear in the tree — expand it to see the file
    const libFolder = app.page.locator('span:has-text("lib")').first();
    await expect(libFolder).toBeVisible();
    await libFolder.click();
    await app.page.waitForTimeout(300);

    // The nested file should be visible inside the expanded folder
    const shapesBtn = app.page.locator('button[title="shapes.scad"]');
    await expect(shapesBtn).toBeVisible();

    // The file should already be active (just created), type content and save
    await setMonacoValue(app.page, 'module my_shape() { sphere(5); }');
    await app.page.waitForTimeout(300);
    await app.page.keyboard.press('Meta+S');
    await app.page.waitForTimeout(500);

    // Switch to main.scad, then back to the nested file
    await app.page.locator('button[title="main.scad"]').click();
    await app.page.waitForTimeout(500);

    // The nested file should still be under "lib" — not moved to root
    await expect(shapesBtn).toBeVisible();
    await shapesBtn.click();
    await app.page.waitForTimeout(500);

    // Content should persist after save + tab switch
    const content = await getMonacoValue(app.page);
    expect(content).toContain('my_shape');

    // Verify include resolution still works from main.scad
    await app.page.locator('button[title="main.scad"]').click();
    await app.page.waitForTimeout(500);
    await setMonacoValue(app.page, 'use <lib/shapes.scad>\nmy_shape();');
    await app.page.waitForTimeout(300);
    await app.triggerRender();
    await app.waitForRender();
    await expect(app.previewCanvas3D).toBeVisible();
  });
});
