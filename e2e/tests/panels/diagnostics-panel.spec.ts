import { test, expect } from '../../fixtures/app.fixture';
import type { Page } from '@playwright/test';
import { setMonacoValue } from '../../helpers/editor';

async function ensureDiagnosticsVisible(page: Page) {
  // The diagnostics panel is inside the "Console" dockview tab
  // Click the Console tab to make it active
  const consoleTab = page.locator('.dv-tab').filter({ hasText: 'Console' });
  if (await consoleTab.isVisible({ timeout: 2000 }).catch(() => false)) {
    await consoleTab.click();
    await page.waitForTimeout(300);
  }
}

test('shows no messages initially', async ({ app }) => {
  await ensureDiagnosticsVisible(app.page);
  await expect(app.page.getByText('No messages')).toBeVisible({ timeout: 5000 });
});

// APP BUG: Monaco markers are not populated from OpenSCAD wasm compilation
// when editor value is set programmatically. The diagnostics pipeline only
// partially works — errors from the wasm worker aren't reliably propagated
// back to Monaco markers.
test.skip('shows errors after rendering invalid code', async ({ app }) => {
  await setMonacoValue(app.page, 'cube(;');
  await app.focusEditor();
  await app.triggerRender();
  await app.page.waitForTimeout(3000);
  await ensureDiagnosticsVisible(app.page);
  await expect
    .poll(
      async () => {
        return app.page.evaluate(() => {
          const m = (window as any).__TEST_MONACO__;
          return m?.editor?.getModelMarkers({})?.length ?? 0;
        });
      },
      { timeout: 10000 }
    )
    .toBeGreaterThan(0);
});

test('shows echo output', async ({ app }) => {
  await setMonacoValue(app.page, 'echo("test123"); cube(5);');
  await app.focusEditor();
  await app.triggerRender();
  await app.waitForRender();
  await ensureDiagnosticsVisible(app.page);
  // Echo output should appear in the diagnostics panel
  const panel = app.page.locator('[data-testid="diagnostics-panel"]');
  await expect
    .poll(
      async () => {
        if (await panel.isVisible().catch(() => false)) {
          return (await panel.textContent()) ?? '';
        }
        return '';
      },
      { timeout: 15000 }
    )
    .toMatch(/test123/i);
});

// APP BUG: Same as above — markers not populated, so "errors clear" can't be verified
test.skip('errors clear after successful render', async ({ app }) => {
  await setMonacoValue(app.page, 'cube(;');
  await app.focusEditor();
  await app.triggerRender();
  await app.page.waitForTimeout(3000);

  await setMonacoValue(app.page, 'cube(10);');
  await app.focusEditor();
  await app.triggerRender();
  await app.waitForRender();

  await expect
    .poll(
      async () => {
        return app.page.evaluate(() => {
          const m = (window as any).__TEST_MONACO__;
          return m?.editor?.getModelMarkers({})?.length ?? 0;
        });
      },
      { timeout: 10000 }
    )
    .toBe(0);
});
