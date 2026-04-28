import { Page } from '@playwright/test';

/**
 * Detect at runtime whether we're testing in a Tauri WebView.
 */
export async function isTauriApp(page: Page): Promise<boolean> {
  return page.evaluate(() => '__TAURI_INTERNALS__' in window);
}

/**
 * Read a .scad fixture file and return its content.
 */
export function readFixture(fixtureName: string): string {
  const fs = require('fs');
  const path = require('path');
  const fixturePath = path.join(__dirname, '..', 'fixtures', 'test-data', fixtureName);
  return fs.readFileSync(fixturePath, 'utf-8');
}

/**
 * Modifier key that differs between platforms.
 * On Mac: Meta, on others: Control
 */
export function modKey(): string {
  return process.platform === 'darwin' ? 'Meta' : 'Control';
}

/**
 * Dismiss any overlay dialogs (welcome screen) that may appear.
 */
export async function dismissOverlays(page: Page): Promise<void> {
  // Welcome screen
  const startEmpty = page.getByText('Start with empty project');
  if (await startEmpty.isVisible({ timeout: 1500 }).catch(() => false)) {
    await startEmpty.click();
    await page.waitForTimeout(500);
  }
}
