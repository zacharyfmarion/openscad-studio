import { test, expect } from '../../fixtures/app.fixture';

test.describe('Customizer Panel', () => {
  async function ensureCustomizerVisible(page: import('@playwright/test').Page) {
    const customizerTab = page.locator('.dv-tab').filter({ hasText: 'Customizer' });
    if (!(await customizerTab.isVisible().catch(() => false))) {
      test.skip(true, 'Customizer tab not available in layout');
    }
    await customizerTab.click();
    await expect(page.getByTestId('customizer-panel')).toBeVisible({ timeout: 10_000 });
  }

  async function updateCustomizerCode(
    app: import('../../fixtures/app.fixture').AppHelper,
    code: string,
    expectedState: 'empty' | 'ready'
  ) {
    await app.updateSourceAndRender(code, 'manual', { waitForPreviewState: false });
    await app.waitForRender();
    await app.waitForCustomizerState(expectedState, { timeout: 10_000 });
  }

  async function useCustomizerFirstLayout(app: import('../../fixtures/app.fixture').AppHelper) {
    await app.page.evaluate(() => {
      localStorage.setItem(
        'openscad-studio-settings',
        JSON.stringify({
          ui: {
            hasCompletedNux: true,
            defaultLayoutPreset: 'customizer-first',
          },
        })
      );
    });

    await app.page.reload();
    await app.page.waitForLoadState('domcontentloaded');
    await app.dismissNux();
    await app.dismissWelcomeScreen();
    await app.waitForRender();
  }

  test('shows the empty-state guidance for simple code', async ({ app }) => {
    await ensureCustomizerVisible(app.page);
    await updateCustomizerCode(app, 'cube(10);', 'empty');
    await expect(app.page.getByTestId('customizer-empty-title')).toBeVisible({ timeout: 5_000 });
  });

  test('detects customizer parameters', async ({ app }) => {
    await ensureCustomizerVisible(app.page);

    const paramCode = [
      'width = 10; // [5:50]',
      'height = 20; // [5:100]',
      'cube([width, height, 5]);',
    ].join('\n');

    await updateCustomizerCode(app, paramCode, 'ready');
    await expect(app.page.getByTestId('customizer-control-width')).toBeVisible({ timeout: 10_000 });
    await expect(app.page.getByTestId('customizer-control-height')).toBeVisible({
      timeout: 5_000,
    });
  });

  test('shows parameter controls', async ({ app }) => {
    await ensureCustomizerVisible(app.page);

    const paramCode = [
      'width = 10; // [5:50]',
      'height = 20; // [5:100]',
      'cube([width, height, 5]);',
    ].join('\n');

    await updateCustomizerCode(app, paramCode, 'ready');
    const widthControl = app.page.getByTestId('customizer-control-width');
    await expect(widthControl.locator('input[type="range"]')).toBeVisible({ timeout: 10_000 });
    await expect(widthControl.locator('input[type="number"]')).toBeVisible({ timeout: 5_000 });
  });

  test('renders @studio metadata labels and keeps advanced controls hidden by default', async ({
    app,
  }) => {
    await ensureCustomizerVisible(app.page);

    const paramCode = [
      '/* [Dimensions] */',
      '// @studio {"label":"Width","description":"Overall width","unit":"mm","group":"Body","prominence":"primary"}',
      'width = 60; // [40:1:120]',
      '// @studio {"label":"Tolerance","group":"Advanced","prominence":"advanced"}',
      'tolerance = 0.3;',
      'cube([width, width, 5]);',
    ].join('\n');

    await updateCustomizerCode(app, paramCode, 'ready');

    const widthControl = app.page.getByTestId('customizer-control-width');
    await expect(widthControl).toBeVisible({ timeout: 10_000 });
    await expect(widthControl.getByText('Width', { exact: true })).toBeVisible({ timeout: 5_000 });
    await expect(widthControl.getByText('Overall width', { exact: true })).toBeVisible({
      timeout: 5_000,
    });
    await expect(app.page.getByTestId('customizer-group-body')).toBeVisible({ timeout: 5_000 });
    await expect(app.page.getByTestId('customizer-control-tolerance')).toHaveCount(0);

    await app.page.getByTestId('customizer-advanced-toggle').click();
    await expect(app.page.getByTestId('customizer-control-tolerance')).toBeVisible({
      timeout: 5_000,
    });
  });

  test('shows the refinement CTA when no parameters are available', async ({ app }) => {
    await ensureCustomizerVisible(app.page);
    await updateCustomizerCode(app, 'cube(10);', 'empty');
    await expect(app.page.getByTestId('customizer-empty-title')).toBeVisible({ timeout: 5_000 });
    await expect(app.page.getByTestId('customizer-refine-button')).toBeVisible({ timeout: 5_000 });
  });

  test('supports the customizer-first layout actions', async ({ app }) => {
    await useCustomizerFirstLayout(app);

    await app.waitForCustomizerState('empty', { timeout: 10_000 });
    await expect(app.page.getByTestId('customizer-refine-button')).toBeVisible({ timeout: 5_000 });
    await expect(app.page.getByRole('button', { name: /Edit Code/i })).toBeVisible({
      timeout: 5_000,
    });

    await app.page.getByRole('button', { name: /Edit Code/i }).click();
    await expect(app.page.locator('.monaco-editor').first()).toBeVisible({ timeout: 10_000 });

    const paramCode = [
      'width = 10; // [5:50]',
      'height = 20; // [5:100]',
      'cube([width, height, 5]);',
    ].join('\n');

    await updateCustomizerCode(app, paramCode, 'ready');

    await app.page.locator('.dv-tab').filter({ hasText: 'Customizer' }).click();
    await app.waitForCustomizerState('ready', { timeout: 10_000 });
    await expect(app.page.getByTestId('customizer-download-button')).toBeVisible({
      timeout: 10_000,
    });
    await app.page.getByTestId('customizer-refine-button').click();
    await expect(app.page.getByText('Add an API key to get started')).toBeVisible({
      timeout: 10_000,
    });
  });

  test('ignores invalid @studio metadata without crashing the panel', async ({ app }) => {
    await ensureCustomizerVisible(app.page);

    const paramCode = [
      '/* [Dimensions] */',
      '// @studio {"label":"Width"',
      'width = 60; // [40:1:120]',
      'cube([width, 20, 5]);',
    ].join('\n');

    await updateCustomizerCode(app, paramCode, 'ready');

    await expect(app.page.getByTestId('customizer-control-width')).toBeVisible({
      timeout: 10_000,
    });
  });
});
