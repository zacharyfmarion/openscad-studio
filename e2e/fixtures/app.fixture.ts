import { test as base, expect, Page, Locator } from '@playwright/test';
import * as http from 'http';
import { getMonacoValue, setMonacoValue } from '../helpers/editor';

type RenderSnapshot = {
  previewSrc: string;
  previewKind: 'mesh' | 'svg';
  diagnostics: Array<{ severity?: string; message?: string }>;
  error: string;
  dimensionMode: '2d' | '3d';
};

type PreviewState = {
  currentFits: boolean;
  fitCount: number;
  maxDim: number | null;
  modelVersion: string | null;
  orthographic: boolean;
  cameraFar: number | null;
  cameraZoom: number | null;
  gridCellSize: number | null;
  gridSectionSize: number | null;
  axisExtent: number | null;
  axisMinorStep: number | null;
  axisMajorStep: number | null;
  axisLabelStep: number | null;
  axesVisible: boolean;
  axisLabelsVisible: boolean;
  cameraPosition: [number, number, number] | null;
  cameraTarget: [number, number, number] | null;
};

async function isLocalServerReady(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${port}/`, (res) => {
      resolve((res.statusCode ?? 500) < 500);
      res.resume();
    });
    req.on('error', () => resolve(false));
    req.setTimeout(2_000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function gotoAppWithRetry(page: Page, timeout = 30_000): Promise<void> {
  try {
    await page.goto('/', { waitUntil: 'domcontentloaded', timeout });
    return;
  } catch (firstError) {
    const serverReady = await isLocalServerReady(3000);
    await page.goto('about:blank', { waitUntil: 'load', timeout: 5_000 }).catch(() => {});

    try {
      await page.goto('/', { waitUntil: 'domcontentloaded', timeout });
      return;
    } catch (secondError) {
      const details = [
        `Initial page.goto('/') failed and retry also failed.`,
        `Server health on retry: ${serverReady ? 'ready' : 'unreachable'}.`,
        `First error: ${String(firstError)}`,
        `Second error: ${String(secondError)}`,
      ].join(' ');
      throw new Error(details);
    }
  }
}

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

  async updateSourceAndRender(
    code: string,
    trigger: string = 'manual'
  ): Promise<RenderSnapshot | null> {
    const snapshot = await this.page.evaluate(
      async ({ nextCode, renderTrigger }) => {
        return (window as any).__TEST_OPENSCAD__?.renderCode?.(nextCode, renderTrigger) ?? null;
      },
      { nextCode: code, renderTrigger: trigger }
    );

    if (snapshot?.previewKind === 'mesh' && snapshot.previewSrc) {
      await this.waitForPreviewState({
        modelVersion: snapshot.previewSrc,
        timeout: 30_000,
      });
    }

    return snapshot;
  }

  async getPreviewState(): Promise<PreviewState | null> {
    return this.page.evaluate(() => (window as any).__TEST_PREVIEW__ ?? null);
  }

  async waitForPreviewState(
    options: {
      timeout?: number;
      modelVersionNot?: string | null;
      modelVersion?: string | null;
      maxDimAtLeast?: number;
      minFitCount?: number;
      fitCount?: number;
      orthographic?: boolean;
      currentFits?: boolean;
      axesVisible?: boolean;
      axisLabelsVisible?: boolean;
    } = {}
  ): Promise<PreviewState> {
    const timeout = options.timeout ?? 30_000;
    await this.page.waitForFunction(
      (expected) => {
        const preview = (window as any).__TEST_PREVIEW__;
        if (!preview) return false;
        if (expected.modelVersion !== undefined && preview.modelVersion !== expected.modelVersion) {
          return false;
        }
        if (
          expected.modelVersionNot !== undefined &&
          preview.modelVersion === expected.modelVersionNot
        ) {
          return false;
        }
        if (
          expected.maxDimAtLeast !== undefined &&
          !(typeof preview.maxDim === 'number' && preview.maxDim >= expected.maxDimAtLeast)
        ) {
          return false;
        }
        if (
          expected.minFitCount !== undefined &&
          !(typeof preview.fitCount === 'number' && preview.fitCount >= expected.minFitCount)
        ) {
          return false;
        }
        if (expected.fitCount !== undefined && preview.fitCount !== expected.fitCount) {
          return false;
        }
        if (expected.orthographic !== undefined && preview.orthographic !== expected.orthographic) {
          return false;
        }
        if (expected.currentFits !== undefined && preview.currentFits !== expected.currentFits) {
          return false;
        }
        if (expected.axesVisible !== undefined && preview.axesVisible !== expected.axesVisible) {
          return false;
        }
        if (
          expected.axisLabelsVisible !== undefined &&
          preview.axisLabelsVisible !== expected.axisLabelsVisible
        ) {
          return false;
        }
        return true;
      },
      options,
      { timeout }
    );

    return (await this.getPreviewState()) as PreviewState;
  }

  async focus3DViewer() {
    await this.page.getByTestId('preview-3d-root').click();
  }

  async focus2DViewer() {
    await this.page.getByTestId('preview-2d-root').click();
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
    const welcomeScreen = this.page.getByTestId('welcome-screen');
    const startButton = this.page.getByTestId('welcome-start-empty-project');
    if (!(await welcomeScreen.isVisible({ timeout: 2_000 }).catch(() => false))) {
      return;
    }

    if (await startButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await startButton.click();
      await welcomeScreen.waitFor({ state: 'hidden', timeout: 5_000 }).catch(() => {});
      await this.page.waitForTimeout(500);
    }
  }

  // -- NUX (legacy first-run layout picker) ----------------------------------

  /** Dismiss the NUX layout picker if shown */
  async dismissNux() {
    const picker = this.page.getByTestId('nux-layout-picker');
    if (await picker.isVisible({ timeout: 3_000 }).catch(() => false)) {
      const editorFirstBtn = this.page.getByTestId('nux-layout-option-default');
      if (await editorFirstBtn.isVisible({ timeout: 1_000 }).catch(() => false)) {
        await editorFirstBtn.click();
      }

      const continueBtn = this.page.getByTestId('nux-layout-continue');
      if (await continueBtn.isVisible({ timeout: 1_000 }).catch(() => false)) {
        await continueBtn.click();
      }

      await picker.waitFor({ state: 'hidden', timeout: 5_000 }).catch(() => {});
      // Wait for the backdrop animation to finish
      await this.page.waitForTimeout(500);
    }
  }

  /** Ensure editor-focused tests start with Monaco visible */
  async openEditorPanel() {
    await this.dismissNux();
    await this.dismissWelcomeScreen();

    if (await this.editorContainer.isVisible({ timeout: 1_000 }).catch(() => false)) {
      return;
    }

    const editorTab = this.page.locator('.dv-tab').filter({ hasText: 'Editor' }).first();
    if (await editorTab.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await editorTab.click();
    } else {
      await this.page.getByRole('button', { name: 'Edit', exact: true }).first().click();
    }

    await this.editorContainer.waitFor({ state: 'visible', timeout: 10_000 });
    await this.page.waitForTimeout(300);
  }

  // -- AI -------------------------------------------------------------------

  /** Focus the AI chat input */
  async focusAiChat() {
    await this.page.keyboard.press('Meta+K');
  }

  async openAiPanel() {
    await this.dismissNux();
    await this.dismissWelcomeScreen();
    const aiTab = this.page.locator('.dv-tab').filter({ hasText: 'AI' });
    await aiTab.click();
    await this.page.waitForTimeout(300);
  }

  async configureAnthropicApiKey(key = 'test-anthropic-key') {
    await this.page.evaluate((apiKey) => {
      localStorage.setItem('openscad_studio_anthropic_api_key', apiKey);
    }, key);
    await this.page.reload();
    await this.page.waitForLoadState('domcontentloaded');
    await this.dismissNux();
    await this.dismissWelcomeScreen();
    await this.page.waitForTimeout(500);
  }

  get aiChatInput(): Locator {
    return this.page.locator('textarea[placeholder="Describe the changes you want to make..."]');
  }

  get aiTranscript(): Locator {
    return this.page.getByTestId('ai-transcript');
  }

  get aiSubmitButton(): Locator {
    return this.page.getByTestId('ai-submit-button');
  }

  get aiCancelButton(): Locator {
    return this.page.getByTestId('ai-cancel-button');
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
  async navigateSettingsTab(tabName: 'Appearance' | 'Viewer' | 'Editor' | 'AI Assistant') {
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
      await page.addInitScript(() => {
        (window as Window & { __PLAYWRIGHT__?: boolean }).__PLAYWRIGHT__ = true;
      });

      // Navigate to app and wait for initial load
      await gotoAppWithRetry(page);
      // Wait for React to mount (the app root should have content)
      await page.waitForTimeout(2000);

      const app = new AppHelper(page, isTauri);

      // Dismiss first-run overlays
      await app.dismissWelcomeScreen();
      await app.openEditorPanel();

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
