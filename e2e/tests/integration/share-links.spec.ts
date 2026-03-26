import { test, expect } from '../../fixtures/app.fixture';
import { setMonacoValue } from '../../helpers/editor';

const SHARE_ID = 'abc12345';
const SHARE_CODE = [
  'width = 18; // [10:40]',
  'height = 12; // [8:24]',
  'cube([width, height, 5]);',
].join('\n');

test.describe('Share links', () => {
  test.describe.configure({ mode: 'serial' });

  test('creates a share link from the dialog', async ({ app }) => {
    await app.page.route('**/api/share', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: SHARE_ID,
          url: `http://localhost:3000/s/${SHARE_ID}`,
          thumbnailUploadToken: 'thumbnail-token',
        }),
      });
    });

    await app.page.route(`**/api/share/${SHARE_ID}/thumbnail`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          thumbnailUrl: `http://localhost:3000/api/share/${SHARE_ID}/thumbnail`,
        }),
      });
    });

    await setMonacoValue(app.page, SHARE_CODE);
    await app.triggerRender();
    await app.waitForRender();

    await app.page.getByTestId('share-button').click();
    await expect(app.page.getByTestId('share-dialog')).toBeVisible();
    await app.page.getByTestId('share-create-button').click();
    await expect(app.page.getByTestId('share-link-input')).toHaveValue(
      `http://localhost:3000/s/${SHARE_ID}`
    );
    await app.page.getByTestId('share-mode-default').click();
    await expect(app.page.getByTestId('share-link-input')).toHaveValue(
      `http://localhost:3000/s/${SHARE_ID}?mode=default`
    );
  });

  test('opens shared links without onboarding and keeps saved layout preference unchanged', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      localStorage.setItem(
        'openscad-studio-settings',
        JSON.stringify({
          ui: {
            hasCompletedNux: false,
            defaultLayoutPreset: 'ai-first',
          },
        })
      );
    });

    await page.route(`**/api/share/${SHARE_ID}`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: SHARE_ID,
          code: SHARE_CODE,
          title: 'Shared Bracket',
          createdAt: '2026-03-24T00:00:00.000Z',
          forkedFrom: null,
          thumbnailUrl: null,
        }),
      });
    });

    await page.goto(`/s/${SHARE_ID}`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('share-banner')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('nux-layout-picker')).toHaveCount(0);
    await expect(page.getByTestId('welcome-container')).toHaveCount(0);
    await expect(page.getByTestId('customizer-control-width')).toBeVisible({ timeout: 15_000 });

    const storedPreset = await page.evaluate(() => {
      const raw = localStorage.getItem('openscad-studio-settings');
      if (!raw) {
        return null;
      }

      return JSON.parse(raw).ui?.defaultLayoutPreset ?? null;
    });
    expect(storedPreset).toBe('ai-first');
  });
});
