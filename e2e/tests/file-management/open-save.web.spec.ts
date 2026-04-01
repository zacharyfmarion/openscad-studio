import { test, expect } from '../../fixtures/app.fixture';
import { setMonacoValue, getMonacoValue } from '../../helpers/editor';

test.describe('File operations (web)', () => {
  /**
   * Force the web fallback path by deleting both File System Access API methods.
   * hasFileSystemAccess() checks 'showOpenFilePicker' in window, so we must
   * delete that too — not just showSaveFilePicker.
   */
  async function forceDownloadFallback(page: import('@playwright/test').Page) {
    await page.evaluate(() => {
      // Built-in Window properties are non-configurable, so 'delete' won't work.
      // Redefine as configurable, then delete — forces hasFileSystemAccess() to false.
      Object.defineProperty(window, 'showOpenFilePicker', {
        value: undefined,
        configurable: true,
        writable: true,
      });
      delete (window as any).showOpenFilePicker;
      Object.defineProperty(window, 'showSaveFilePicker', {
        value: undefined,
        configurable: true,
        writable: true,
      });
      delete (window as any).showSaveFilePicker;
    });
  }

  test('save triggers download', async ({ app }) => {
    await setMonacoValue(app.page, 'cube([5, 5, 5]);');
    // Let Monaco's onChange propagate to React state
    await app.page.waitForTimeout(500);

    // Force download fallback
    await forceDownloadFallback(app.page);

    // Intercept the download — monkeypatch createElement to detect <a download>
    await app.page.evaluate(() => {
      (window as any).__downloadCalled__ = null;
      const origCreate = document.createElement.bind(document);
      document.createElement = function (tag: string, ...args: any[]) {
        const el = origCreate(tag, ...args);
        if (tag === 'a') {
          const origClick = el.click.bind(el);
          el.click = function () {
            if (el.download) {
              (window as any).__downloadCalled__ = {
                filename: el.download,
                href: el.href,
              };
            }
            return origClick();
          };
        }
        return el;
      };
    });

    // Click File > Save As from the menu (more reliable than Meta+S keybinding)
    await app.page.getByText('File').first().click();
    await app.page.getByText('Save As').click();

    // Wait for the download intercept to fire
    await app.page.waitForFunction(() => (window as any).__downloadCalled__ !== null, {
      timeout: 10_000,
    });

    const result = await app.page.evaluate(() => (window as any).__downloadCalled__);
    expect(result.filename).toMatch(/\.scad$/);
    expect(result.href).toContain('blob:');
  });

  test('file can be opened via file input', async ({ app }) => {
    // Remove the native file picker API to force fallback
    await forceDownloadFallback(app.page);

    // Set up filechooser listener BEFORE clicking Open File
    const fileChooserPromise = app.page.waitForEvent('filechooser', { timeout: 10_000 });

    // Click File > Open File menu
    await app.page.getByText('File').first().click();
    await app.page.getByText('Open File').click();

    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles({
      name: 'test-open.scad',
      mimeType: 'text/plain',
      buffer: Buffer.from('cube([7, 7, 7]);'),
    });

    await app.page.waitForTimeout(1000);
    const content = await getMonacoValue(app.page);
    expect(content).toContain('cube([7, 7, 7])');
  });
});
