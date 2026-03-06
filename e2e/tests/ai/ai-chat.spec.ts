import { test, expect } from '../../fixtures/app.fixture';

test.describe('AI Chat Panel', () => {
  async function activateAiPanel(page: import('@playwright/test').Page) {
    const aiTab = page.locator('.dv-tab').filter({ hasText: 'AI' });
    await aiTab.click();
    await page.waitForTimeout(500);
  }

  test('AI panel is accessible via tab click', async ({ app }) => {
    await activateAiPanel(app.page);
    // Should show either the API key prompt or the chat textarea
    await expect(
      app.page.getByText('Add an API key').or(app.page.getByPlaceholder(/describe the changes/i))
    ).toBeVisible({ timeout: 5000 });
  });

  test('shows no API key message when unconfigured', async ({ app }) => {
    await activateAiPanel(app.page);
    await expect(app.page.getByText('Add an API key')).toBeVisible({ timeout: 5000 });
  });

  test('new conversation button exists when API key set', async ({ app }) => {
    // The '+ New' button only renders when hasApiKey is true.
    // Without an API key configured, the panel shows 'Add an API key' instead.
    await activateAiPanel(app.page);
    // Verify the no-API-key state shows the expected UI
    const hasApiKeyPrompt = await app.page.getByText('Add an API key').isVisible({ timeout: 3000 }).catch(() => false);
    if (hasApiKeyPrompt) {
      // No API key → '+ New' button is correctly hidden
      await expect(app.page.getByTitle('Start new conversation')).not.toBeAttached();
      return;
    }
    // If API key IS set (e.g., in CI), the button should exist
    await expect(app.page.getByTitle('Start new conversation')).toBeAttached({ timeout: 5000 });
  });

  test('open settings button exists when no API key', async ({ app }) => {
    await activateAiPanel(app.page);
    await expect(app.page.getByText('Open Settings')).toBeVisible({ timeout: 5000 });
  });

  test('Meta+K shortcut activates AI panel', async ({ app }) => {
    // Switch away from AI panel first
    const editorTab = app.page.locator('.dv-tab').filter({ hasText: 'Editor' });
    if (await editorTab.isVisible().catch(() => false)) {
      await editorTab.click();
      await app.page.waitForTimeout(300);
    }

    await app.page.keyboard.press('Meta+k');
    await expect(
      app.page.getByText('Add an API key').or(app.page.getByPlaceholder(/describe the changes/i))
    ).toBeVisible({ timeout: 5000 });
  });
});
