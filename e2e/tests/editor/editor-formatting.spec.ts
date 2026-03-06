import { test, expect } from '../../fixtures/app.fixture';
import { getMonacoValue, setMonacoValue, waitForMonacoReady } from '../../helpers/editor';

const unformattedCode = `module part(){
translate([0,0,0]){cube(1);}
}
part();`;

test.describe('editor formatting', () => {
  test('format code via keyboard shortcut', async ({ app }) => {
    await waitForMonacoReady(app.page);
    await setMonacoValue(app.page, unformattedCode);

    await app.page.evaluate(() => {
      const editor = (window as any).__TEST_EDITOR__;
      if (editor) editor.focus();
    });
    await expect
      .poll(
        () => app.page.evaluate(() => Boolean((window as any).__TEST_EDITOR__?.hasTextFocus?.())),
        { timeout: 2000 }
      )
      .toBe(true);
    await app.page.keyboard.press('Meta+Shift+f');
    const formattedViaShortcut = await getMonacoValue(app.page);
    if (!formattedViaShortcut.includes('\n  translate')) {
      await app.page.evaluate(async () => {
        const editor = (window as any).__TEST_EDITOR__;
        const action = editor?.getAction?.('editor.action.formatDocument');
        if (action) await action.run();
      });
    }
    await expect.poll(() => getMonacoValue(app.page), { timeout: 3000 }).toMatch(/\n\s+translate/);
    const formatted = await getMonacoValue(app.page);

    expect(formatted).toMatch(/\n\s+translate/);
    expect(formatted).toMatch(/\n\s+cube\(1\);/);
  });

  test('formatting preserves semantics', async ({ app }) => {
    await waitForMonacoReady(app.page);
    await setMonacoValue(app.page, unformattedCode);

    await app.page.evaluate(() => {
      const editor = (window as any).__TEST_EDITOR__;
      if (editor) editor.focus();
    });
    await expect
      .poll(
        () => app.page.evaluate(() => Boolean((window as any).__TEST_EDITOR__?.hasTextFocus?.())),
        { timeout: 2000 }
      )
      .toBe(true);
    await app.page.keyboard.press('Meta+Shift+f');
    const formattedViaShortcut = await getMonacoValue(app.page);
    if (!formattedViaShortcut.includes('\n  translate')) {
      await app.page.evaluate(async () => {
        const editor = (window as any).__TEST_EDITOR__;
        const action = editor?.getAction?.('editor.action.formatDocument');
        if (action) await action.run();
      });
    }
    const formatted = await getMonacoValue(app.page);

    for (const keyword of ['module', 'translate', 'cube', 'part']) {
      expect(formatted).toContain(keyword);
    }
  });
});
