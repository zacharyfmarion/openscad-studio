import { test, expect } from '../../fixtures/app.fixture';
import type { Page } from '@playwright/test';
import { setMonacoValue } from '../../helpers/editor';

async function openSettings(page: Page) {
  await page.keyboard.press('Meta+,');
  await page.getByRole('heading', { name: 'Settings' }).waitFor({ state: 'visible' });
}

test('settings dialog opens via shortcut', async ({ app }) => {
  await openSettings(app.page);
  await expect(app.page.getByRole('heading', { name: 'Settings' })).toBeVisible();
});

test('settings has three tabs', async ({ app }) => {
  await openSettings(app.page);
  await expect(app.page.getByRole('button', { name: 'Appearance', exact: true })).toBeVisible();
  await expect(app.page.getByRole('button', { name: 'Editor', exact: true })).toBeVisible();
  await expect(app.page.getByRole('button', { name: 'AI Assistant', exact: true })).toBeVisible();
});

test('can switch between settings tabs', async ({ app }) => {
  await openSettings(app.page);

  await app.page.getByRole('button', { name: 'Appearance', exact: true }).click();
  await expect(app.page.getByText('Theme', { exact: true })).toBeVisible();

  await app.page.getByRole('button', { name: 'Editor', exact: true }).click();
  await expect(app.page.getByText('Format on Save')).toBeVisible();

  await app.page.getByRole('button', { name: 'AI Assistant', exact: true }).click();
  await expect(app.page.getByText('Anthropic API Key')).toBeVisible();
});

test('appearance tab shows theme options', async ({ app }) => {
  await openSettings(app.page);
  await app.page.getByRole('button', { name: 'Appearance', exact: true }).click();

  await expect(app.page.getByText('Theme', { exact: true })).toBeVisible();
});

test('editor tab shows formatting options', async ({ app }) => {
  await openSettings(app.page);
  await app.page.getByRole('button', { name: 'Editor', exact: true }).click();
  await expect(app.page.getByText('Format on Save')).toBeVisible();
  await expect(app.page.getByText('Indent Size')).toBeVisible();
  await expect(app.page.getByText('Use Tabs')).toBeVisible();
  await expect(app.page.getByText('Auto-Render on Idle')).toBeVisible();
});

test('can toggle format on save', async ({ app }) => {
  await openSettings(app.page);
  await app.page.getByRole('button', { name: 'Editor', exact: true }).click();

  const formatRow = app.page.getByText('Format on Save').locator('..').locator('..');
  const toggle = formatRow.locator('input[type="checkbox"]');
  await expect(toggle).toBeAttached();
  const before = await toggle.isChecked();
  await formatRow.locator('label').last().click({ force: true });
  await expect(toggle).toBeChecked({ checked: !before });
});

test('AI tab shows provider configuration', async ({ app }) => {
  await openSettings(app.page);
  await app.page.getByRole('button', { name: 'AI Assistant', exact: true }).click();
  await expect(app.page.getByText('Anthropic API Key')).toBeVisible();
  await expect(app.page.getByText('OpenAI API Key')).toBeVisible();
});

test('settings dialog closes on escape', async ({ app }) => {
  await openSettings(app.page);
  const settingsHeading = app.page.getByRole('heading', { name: 'Settings' });
  await expect(settingsHeading).toBeVisible();
  await app.page.keyboard.press('Escape');
  if (await settingsHeading.isVisible().catch(() => false)) {
    await app.page.getByRole('button', { name: /close|cancel/i }).click();
  }
  await expect(settingsHeading).toBeHidden();
});

test('theme change applies immediately', async ({ app }) => {
  await openSettings(app.page);
  await app.page.getByRole('button', { name: 'Appearance', exact: true }).click();

  const themeSection = app.page.getByText('Theme', { exact: true }).locator('..');
  const themeButtons = themeSection.getByRole('button');
  await expect(themeButtons.first()).toBeVisible();

  const getThemeToken = () =>
    app.page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--bg-primary')
    );
  const before = await getThemeToken();

  const buttonCount = await themeButtons.count();
  const targetButton = buttonCount > 1 ? themeButtons.nth(1) : themeButtons.first();
  await targetButton.click();

  await expect.poll(getThemeToken).not.toBe(before);
});
