import { test as base, expect, Page, Locator } from '@playwright/test';
import { getMonacoValue, setMonacoValue } from '../helpers/editor';

// ---------------------------------------------------------------------------
// AppHelper — thin abstraction over common app interactions
// ---------------------------------------------------------------------------
export class AppHelper {
  readonly page: Page;
  readonly isTauri: boolean;

  constructor(page: Page, isTauri: boolean) {
    this.page = page;
    this.isTauri = isTauri;
  }

  // -- Editor ---------------------------------------------------------------

  /** Monaco editor wrapper element */
  get editorContainer(): Locator {
    return this.page.locator('.monaco-editor').first();
  }

  /** The actual Monaco text area that receives keyboard input */
  private get editorTextArea(): Locator {
    return this.page.locator('.monaco-editor textarea.inputarea').first();
  }

  /** Set the editor content by selecting all and typing replacement text */
  async setEditorContent(code: string) {
    await setMonacoValue(this.page, code);
  }

  /** Get current editor content via Monaco's API or DOM fallback */
  async getEditorContent(): Promise<string> {
    return getMonacoValue(this.page);
  }

  /** Focus the editor */
  async focusEditor() {
    await this.page.evaluate(() => {
      const editor = (window as any).__TEST_EDITOR__;
      if (editor) editor.focus();
    });
  }

  // -- Preview / Rendering --------------------------------------------------

  /** 3D canvas (Three.js / R3F) */
  get previewCanvas3D(): Locator {
    return this.page.locator('canvas[data-engine]').first();
  }

  /** 2D SVG preview container */
  get previewSvg2D(): Locator {
    return this.page.locator('[data-preview-svg]').first();
  }

  /** The render button */
  get renderButton(): Locator {
    return this.page.getByRole('button', { name: /Render/i }).first();
  }

  /** Trigger a manual render via __TEST_OPENSCAD__ or keyboard shortcut */
  async triggerRender() {
    const hasTestOpenScad = await this.page.evaluate(
      () => !!(window as any).__TEST_OPENSCAD__?.manualRender
    );
    if (hasTestOpenScad) {
      await this.page.evaluate(() => (window as any).__TEST_OPENSCAD__.manualRender());
    } else {
      await this.page.keyboard.press('Meta+Enter');
    }
  }

  /**
   * Wait for a render to complete.
   * Detects the "Rendering" spinner disappearing and preview becoming visible.
   */
  async waitForRender(options?: { timeout?: number }) {
    const timeout = options?.timeout ?? 30_000;

    // Wait for any "Rendering..." indicator to disappear
    await this.page
      .locator('text=Rendering')
      .waitFor({ state: 'hidden', timeout })
      .catch(() => {
        // Spinner may have already gone by the time we check
      });

    // Wait for either 3D canvas or 2D SVG to be visible
    await Promise.race([
      this.previewCanvas3D.waitFor({ state: 'visible', timeout }).catch(() => {}),
      this.previewSvg2D.waitFor({ state: 'visible', timeout }).catch(() => {}),
    ]);

    // Extra settle time for Three.js to finish drawing
    await this.page.waitForTimeout(500);
  }

  /** Wait for the WASM engine to initialize (web only) */
  async waitForWasmReady(timeout = 30_000) {
    if (this.isTauri) return;
    // The render button becomes enabled / the app becomes interactive
    // once WASM is ready. We detect this by waiting for the initial
    // default render to complete (cube shows up in preview).
    await this.waitForRender({ timeout });
  }

  /** Take a screenshot of just the preview area */
  async screenshotPreview(): Promise<Buffer> {
    // Try 3D canvas first, fall back to SVG container
    const canvas = this.previewCanvas3D;
    if (await canvas.isVisible().catch(() => false)) {
      return (await canvas.screenshot()) as Buffer;
    }
    const svg = this.previewSvg2D;
    if (await svg.isVisible().catch(() => false)) {
      return (await svg.screenshot()) as Buffer;
    }
    // Fallback: screenshot the whole page
    return (await this.page.screenshot()) as Buffer;
  }

  // -- Dialogs --------------------------------------------------------------

  /** Open the export dialog */
  async openExportDialog() {
    await this.page
      .getByRole('button', { name: /Export/i })
      .first()
      .click();
    await this.page.locator('text=Export Model').waitFor({ state: 'visible' });
  }

  /** Open settings dialog */
  async openSettings() {
    await this.page.keyboard.press('Meta+,');
    await this.page.getByText('Appearance').first().waitFor({ state: 'visible' });
  }

  /** Close any modal dialog by clicking X or pressing Escape */
  async closeDialog() {
    await this.page.keyboard.press('Escape');
    await this.page.waitForTimeout(200);
  }

  // -- Welcome Screen -------------------------------------------------------

  /** Dismiss the welcome screen if it's showing */
  async dismissWelcomeScreen() {
    const startButton = this.page.getByText('Start with empty project');
    if (await startButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await startButton.click();
      await startButton.waitFor({ state: 'hidden', timeout: 3000 }).catch(() => {});
    }
  }

  // -- NUX (first-run layout picker) ----------------------------------------

  /** Dismiss the NUX layout picker if shown */
  async dismissNux() {
    // The NUX modal has heading 'Choose your workspace layout' and a 'Continue' button
    const nuxHeading = this.page.getByText('Choose your workspace layout');
    if (await nuxHeading.isVisible({ timeout: 3000 }).catch(() => false)) {
      // Select 'Editor First' layout (default is 'AI First' which hides the editor)
      const editorFirstBtn = this.page.getByText('Editor First');
      if (await editorFirstBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
        await editorFirstBtn.click();
      }
      // Click Continue to apply and dismiss
      const continueBtn = this.page.getByRole('button', { name: /continue/i });
      if (await continueBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
        await continueBtn.click();
      }
      await nuxHeading.waitFor({ state: 'hidden', timeout: 3000 }).catch(() => {});
      // Wait for the backdrop animation to finish
      await this.page.waitForTimeout(500);
    }
  }

  // -- AI -------------------------------------------------------------------

  /** Focus the AI chat input */
  async focusAiChat() {
    await this.page.keyboard.press('Meta+K');
  }

  get aiChatInput(): Locator {
    return this.page.locator('textarea[placeholder="Describe the changes you want to make..."]');
  }

  get aiMessages(): Locator {
    return this.page.locator('[class*="overflow-y-auto"]').last();
  }

  // -- File operations (web) ------------------------------------------------

  /** Trigger "New File" via menu or shortcut */
  async newFile() {
    await this.page.keyboard.press('Meta+N');
  }

  // -- Diagnostics ----------------------------------------------------------

  get diagnosticsPanel(): Locator {
    // Find the diagnostics/console panel content area
    return this.page.locator('text=Diagnostics').first();
  }

  /** Get all diagnostic error messages currently shown */
  async getDiagnosticErrors(): Promise<string[]> {
    const errorBadges = this.page.locator('span:has-text("error")');
    const count = await errorBadges.count();
    const errors: string[] = [];
    for (let i = 0; i < count; i++) {
      const row = errorBadges.nth(i).locator('..');
      errors.push((await row.textContent()) ?? '');
    }
    return errors;
  }

  // -- Tabs (Tauri only) ----------------------------------------------------

  get tabBar(): Locator {
    return this.page.locator('[class*="tab"]').first();
  }

  async newTab() {
    await this.page.keyboard.press('Meta+T');
  }

  async closeTab() {
    await this.page.keyboard.press('Meta+W');
  }

  // -- Settings helpers -----------------------------------------------------

  /** Navigate to a settings tab */
  async navigateSettingsTab(tabName: 'Appearance' | 'Editor' | 'AI Assistant') {
    await this.page.getByRole('button', { name: tabName, exact: true }).click();
  }

  // -- Utility --------------------------------------------------------------

  /** Clear localStorage to simulate first-run state */
  async clearStorage() {
    await this.page.evaluate(() => localStorage.clear());
  }
}

// ---------------------------------------------------------------------------
// Test fixture that provides `app` and `isTauri`
// ---------------------------------------------------------------------------
export type AppFixtures = {
  app: AppHelper;
  isTauri: boolean;
};

export const test = base.extend<AppFixtures>({
  isTauri: [
    async ({ page: _page }, use, testInfo) => {
      await use(testInfo.project.name === 'tauri-desktop');
    },
    { scope: 'test' },
  ],

  app: [
    async ({ page, isTauri }, use) => {
      // Navigate to app and wait for initial load
      await page.goto('/');
      await page.waitForLoadState('domcontentloaded');
      await page.evaluate(() => {
        (window as any).__PLAYWRIGHT__ = true;
      });
      // Wait for React to mount (the app root should have content)
      await page.waitForTimeout(2000);

      const app = new AppHelper(page, isTauri);

      // Dismiss first-run overlays (order matters: NUX appears on top)
      await app.dismissNux();
      await app.dismissWelcomeScreen();

      // Wait for Monaco editor to be available
      await page.waitForSelector('.monaco-editor', { timeout: 15_000 }).catch(() => {
        // Editor may not be visible if a different panel is active
      });
      // Small delay for editor initialization
      await page.waitForTimeout(500);

      await use(app);
    },
    { scope: 'test' },
  ],
});

export { expect };
