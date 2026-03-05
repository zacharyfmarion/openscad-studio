import { test, expect } from '../../fixtures/app.fixture';
import { setMonacoValue, getMonacoValue } from '../../helpers/editor';

test('save triggers download', async ({ app }) => {
  await setMonacoValue(app.page, 'cube([3, 3, 3]);');
  await app.focusEditor();
  await app.page.evaluate(() => {
    const win = window as unknown as Record<string, unknown>;
    delete win.showSaveFilePicker;
  });

  const downloadPromise = app.page.waitForEvent('download');
  await app.page.keyboard.press('Meta+S');
  const download = await downloadPromise;

  expect(download.suggestedFilename()).toContain('.scad');
});

test('file can be opened via file input', async ({ app }) => {
  const fileContent = 'cube([7, 7, 7]);';
  await app.page.evaluate(() => {
    const win = window as unknown as Record<string, unknown>;
    delete win.showOpenFilePicker;
  });
  const fileChooserPromise = app.page.waitForEvent('filechooser');

  await app.page.getByRole('button', { name: 'File' }).click();
  await app.page.getByRole('button', { name: 'Open File...' }).click();
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles({
    name: 'fixture.scad',
    mimeType: 'text/plain',
    buffer: Buffer.from(fileContent),
  });

  await expect.poll(async () => (await getMonacoValue(app.page)).trim()).toBe(fileContent);
});
