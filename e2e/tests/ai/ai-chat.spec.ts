import { test, expect } from '../../fixtures/app.fixture';

// Note: AI chat tests run without an API key configured.
// Without an API key, the panel shows "Add an API key to get started"
// and a textarea is NOT rendered. We test the no-API-key state.

async function activateAiPanel(page: import('@playwright/test').Page) {
  // Click the AI tab in dockview to ensure the panel is visible
  const aiTab = page.locator('.dv-tab').filter({ hasText: 'AI' });
  if (await aiTab.isVisible({ timeout: 2000 }).catch(() => false)) {
    await aiTab.click();
    await page.waitForTimeout(300);
  }
}

test.describe('AI chat panel', () => {
  test('AI panel is accessible via tab click', async ({ app }) => {
    await activateAiPanel(app.page);
    // The AI panel should be visible — either showing the chat or the "no API key" prompt
    const noKeyMessage = app.page.getByText(/Add an API key/i);
    const chatInput = app.page.locator('textarea[placeholder*="Describe"]');
    // One of these should be visible
    const hasNoKey = await noKeyMessage.isVisible().catch(() => false);
    const hasChat = await chatInput.isVisible().catch(() => false);
    expect(hasNoKey || hasChat).toBe(true);
  });

  test('shows no API key message when unconfigured', async ({ app }) => {
    await activateAiPanel(app.page);
    await expect(app.page.getByText(/Add an API key/i)).toBeVisible();
  });

  test('new conversation button exists', async ({ app }) => {
    await activateAiPanel(app.page);
    // The + New button should be visible in the panel header
    const newButton = app.page.getByRole('button', { name: /new/i });
    await expect(newButton.first()).toBeVisible();
  });

  test('open settings button exists when no API key', async ({ app }) => {
    await activateAiPanel(app.page);
    // When no API key is set, there should be an "Open Settings" button/link
    const openSettingsBtn = app.page.getByText(/Open Settings/i);
    await expect(openSettingsBtn).toBeVisible();
  });

  test('Meta+K shortcut activates AI panel', async ({ app }) => {
    // First switch to editor
    const editorTab = app.page.locator('.dv-tab').filter({ hasText: 'Editor' });
    if (await editorTab.isVisible().catch(() => false)) {
      await editorTab.click();
      await app.page.waitForTimeout(200);
    }
    // Press Meta+K to switch to AI
    await app.page.keyboard.press('Meta+k');
    await app.page.waitForTimeout(500);
    // The AI panel content should be visible
    const noKeyMessage = app.page.getByText(/Add an API key/i);
    const chatInput = app.page.locator('textarea[placeholder*="Describe"]');
    const hasNoKey = await noKeyMessage.isVisible().catch(() => false);
    const hasChat = await chatInput.isVisible().catch(() => false);
    expect(hasNoKey || hasChat).toBe(true);
  });
});
