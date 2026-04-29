import { test, expect } from '../../fixtures/app.fixture';
import { setMonacoValue, getMonacoValue } from '../../helpers/editor';

const DEFAULT_CONTENT = '// Type your OpenSCAD code here\ncube([10, 10, 10]);';

test.describe('New file', () => {
  /**
   * Click File > New File, accepting all native dialogs (window.confirm).
   * After createNewTab(), the app shows the welcome screen. Dismissing it
   * re-mounts the Monaco editor with the new tab's default content.
   */
  async function createNewFile(page: import('@playwright/test').Page) {
    // Handle native dialogs (window.confirm). The app's checkUnsavedChanges flow:
    // 1. "Do you want to save?" → dismiss (No, don't save) to avoid showSaveFilePicker
    // 2. "Are you sure you want to discard?" → accept (Yes, discard)
    let dialogCount = 0;
    page.on('dialog', async (dialog) => {
      dialogCount++;
      if (dialogCount === 1) {
        // "Do you want to save?" → No, don't save
        await dialog.dismiss();
      } else {
        // "Are you sure you want to discard?" → Yes, discard
        await dialog.accept();
      }
    });

    // File > New File
    await page.getByText('File').first().click();
    await page.getByText('New File').click();
    await page.waitForTimeout(1000);

    // The welcome screen appears after createNewTab() — dismiss it
    const welcomeScreen = page.locator('[data-testid="welcome-screen"]');
    if (await welcomeScreen.isVisible({ timeout: 3000 }).catch(() => false)) {
      const startEmpty = page.getByTestId('welcome-start-empty-project');
      if (await startEmpty.isVisible().catch(() => false)) {
        await startEmpty.click();
      }
    }

    // The app defaults to AI-first after the welcome flow; activate the editor tab.
    const editorTab = page.locator('.dv-tab').filter({ hasText: 'Editor' }).first();
    if (await editorTab.isVisible({ timeout: 3000 }).catch(() => false)) {
      await editorTab.click();
    }

    // Wait for the Monaco editor to re-mount with the new tab's content
    await page.locator('.monaco-editor').first().waitFor({ state: 'visible', timeout: 5000 });
    // Give __TEST_EDITOR__ time to update in the onMount callback
    await page.waitForTimeout(1000);
  }

  test('new file resets to default content', async ({ app }) => {
    // Modify editor content (makes tab dirty)
    await setMonacoValue(app.page, 'sphere(42);');
    await app.page.waitForTimeout(500);
    expect(await getMonacoValue(app.page)).toContain('sphere(42)');

    // Create new file (accepts confirm dialogs)
    await createNewFile(app.page);

    // Content should be the default boilerplate
    const content = await getMonacoValue(app.page);
    expect(content).toBe(DEFAULT_CONTENT);
  });

  test('new file after modifications prompts confirmation', async ({ app }) => {
    // Modify editor content to make it dirty
    await setMonacoValue(app.page, 'cylinder(h = 5, r = 3);');
    await app.page.waitForTimeout(500);

    // Track whether dialog appears
    let dialogSeen = false;
    let dialogCount = 0;
    app.page.on('dialog', async (dialog) => {
      dialogSeen = true;
      dialogCount++;
      if (dialogCount === 1) {
        // "Save?" → No, don't save (avoid showSaveFilePicker)
        await dialog.dismiss();
      } else {
        // "Discard?" → Yes
        await dialog.accept();
      }
    });

    // File > New File
    await app.page.getByText('File').first().click();
    await app.page.getByText('New File').click();
    await app.page.waitForTimeout(1000);

    // Verify that a confirmation dialog appeared (tab was dirty)
    expect(dialogSeen).toBe(true);
  });

  test('editor has default content after new file', async ({ app }) => {
    // Modify content and create new file
    await setMonacoValue(app.page, 'translate([1,2,3]) cube(5);');
    await app.page.waitForTimeout(500);

    await createNewFile(app.page);

    const content = await getMonacoValue(app.page);
    expect(content).toBe(DEFAULT_CONTENT);
  });
});
