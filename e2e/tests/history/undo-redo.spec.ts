import { test, expect } from '../../fixtures/app.fixture';
import { getMonacoValue, setMonacoValueUndoable } from '../../helpers/editor';

/**
 * Helper: trigger undo in Monaco editor.
 * Uses editor.trigger('keyboard', 'undo') which works reliably with programmatic edits.
 */
async function triggerUndo(page: import('@playwright/test').Page) {
  await page.evaluate(() => {
    const editor = (window as any).__TEST_EDITOR__;
    if (editor) editor.trigger('keyboard', 'undo', null);
  });
  await page.waitForTimeout(300);
}

/**
 * Helper: trigger redo in Monaco editor.
 */
async function triggerRedo(page: import('@playwright/test').Page) {
  await page.evaluate(() => {
    const editor = (window as any).__TEST_EDITOR__;
    if (editor) editor.trigger('keyboard', 'redo', null);
  });
  await page.waitForTimeout(300);
}

test.describe('Undo / Redo', () => {

  test('undo reverts editor change', async ({ app }) => {
    const initial = await getMonacoValue(app.page);

    await setMonacoValueUndoable(app.page, 'sphere(5);');
    expect(await getMonacoValue(app.page)).toContain('sphere(5)');

    await triggerUndo(app.page);

    const afterUndo = await getMonacoValue(app.page);
    expect(afterUndo).toBe(initial);
  });

  test('redo re-applies change after undo', async ({ app }) => {
    await setMonacoValueUndoable(app.page, 'cube(8);');
    expect(await getMonacoValue(app.page)).toContain('cube(8)');

    await triggerUndo(app.page);
    expect(await getMonacoValue(app.page)).not.toContain('cube(8)');

    await triggerRedo(app.page);
    expect(await getMonacoValue(app.page)).toContain('cube(8)');
  });

  test('multiple undo levels work', async ({ app }) => {
    const initial = await getMonacoValue(app.page);

    await setMonacoValueUndoable(app.page, 'step1();');
    expect(await getMonacoValue(app.page)).toContain('step1()');

    // Force an undo stop so the next edit creates a separate undo entry
    await app.page.evaluate(() => {
      const editor = (window as any).__TEST_EDITOR__;
      if (editor) editor.getModel()?.pushStackElement();
    });

    await setMonacoValueUndoable(app.page, 'step2();');
    expect(await getMonacoValue(app.page)).toContain('step2()');

    // First undo: revert step2 → step1
    await triggerUndo(app.page);
    const afterFirstUndo = await getMonacoValue(app.page);
    expect(afterFirstUndo).toContain('step1()');
    expect(afterFirstUndo).not.toContain('step2()');

    // Second undo: revert step1 → initial
    await triggerUndo(app.page);
    expect(await getMonacoValue(app.page)).toBe(initial);
  });

  test('undo after render preserves state', async ({ app }) => {
    await app.waitForRender();
    const initial = await getMonacoValue(app.page);

    await setMonacoValueUndoable(app.page, 'cube([3, 3, 3]);');
    expect(await getMonacoValue(app.page)).toContain('cube([3, 3, 3])');

    await app.triggerRender();
    await app.waitForRender();

    // Undo should still work after render (render doesn't affect undo stack)
    await triggerUndo(app.page);
    expect(await getMonacoValue(app.page)).toBe(initial);
  });
});
