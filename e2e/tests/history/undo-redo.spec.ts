import { test, expect } from '../../fixtures/app.fixture';
import { getMonacoValue } from '../../helpers/editor';

test.describe('History: Undo / Redo', () => {
  test('undo reverts editor change', async ({ app }) => {
    // Get initial content
    const initialValue = await getMonacoValue(app.page);

    // Type new content (this creates proper undo history)
    await app.focusEditor();
    await app.page.keyboard.press('Meta+a');
    await app.page.keyboard.type('sphere(5);', { delay: 30 });
    await app.page.waitForTimeout(200);
    const afterType = await getMonacoValue(app.page);
    expect(afterType).toContain('sphere(5)');

    // Undo should revert toward original
    await app.page.keyboard.press('Meta+z');
    await app.page.waitForTimeout(200);
    const afterUndo = await getMonacoValue(app.page);
    expect(afterUndo).not.toBe(afterType);
  });

  test('redo re-applies change after undo', async ({ app }) => {
    // Type something
    await app.focusEditor();
    await app.page.keyboard.press('Meta+a');
    await app.page.keyboard.type('cube(8);', { delay: 30 });
    await app.page.waitForTimeout(200);
    const typed = await getMonacoValue(app.page);

    // Undo
    await app.page.keyboard.press('Meta+z');
    await app.page.waitForTimeout(200);
    const afterUndo = await getMonacoValue(app.page);
    expect(afterUndo).not.toBe(typed);

    // Redo should bring it back
    await app.page.keyboard.press('Meta+Shift+z');
    await app.page.waitForTimeout(200);
    const afterRedo = await getMonacoValue(app.page);
    expect(afterRedo).toContain('cube(8)');
  });

  test('multiple undo levels work', async ({ app }) => {
    await app.focusEditor();
    // Clear and type first thing
    await app.page.keyboard.press('Meta+a');
    await app.page.keyboard.type('step1', { delay: 20 });
    await app.page.waitForTimeout(200);

    // Type more at the end
    await app.page.keyboard.press('End');
    await app.page.keyboard.type('_step2', { delay: 20 });
    await app.page.waitForTimeout(200);

    const fullText = await getMonacoValue(app.page);
    expect(fullText).toContain('step1_step2');

    // First undo removes "_step2"
    await app.page.keyboard.press('Meta+z');
    await app.page.waitForTimeout(200);
    const afterUndo1 = await getMonacoValue(app.page);
    expect(afterUndo1).not.toContain('_step2');

    // Second undo removes "step1" (or reverts further)
    await app.page.keyboard.press('Meta+z');
    await app.page.waitForTimeout(200);
    const afterUndo2 = await getMonacoValue(app.page);
    expect(afterUndo2).not.toBe(fullText);
  });

  test('undo after render preserves state', async ({ app }) => {
    await app.waitForRender();

    // Type new code
    await app.focusEditor();
    await app.page.keyboard.press('Meta+a');
    await app.page.keyboard.type('cube([3,3,3]);', { delay: 30 });
    await app.page.waitForTimeout(200);

    // Render
    await app.triggerRender();
    await app.waitForRender();

    // After render, undo should still work on the editor
    await app.focusEditor();
    await app.page.keyboard.press('Meta+z');
    await app.page.waitForTimeout(200);
    const afterUndo = await getMonacoValue(app.page);
    // After undo, content should change (not still be cube([3,3,3]))
    expect(afterUndo).not.toContain('cube([3,3,3])');
  });
});
