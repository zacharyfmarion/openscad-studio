import { test, expect } from '../../fixtures/app.fixture';
import {
  getMonacoValue,
  waitForMonacoReady,
  typeInEditor,
  selectAllInEditor,
} from '../../helpers/editor';

test.describe('editor basics', () => {
  test('editor loads and is visible', async ({ app }) => {
    await waitForMonacoReady(app.page);
    await expect(app.page.locator('.monaco-editor')).toBeVisible();
  });

  test('editor has default content', async ({ app }) => {
    await waitForMonacoReady(app.page);
    const value = await getMonacoValue(app.page);
    expect(value).toContain('cube([10, 10, 10])');
  });

  test('can type OpenSCAD code', async ({ app }) => {
    await waitForMonacoReady(app.page);
    await selectAllInEditor(app.page);
    await typeInEditor(app.page, 'sphere(5);');
    const value = await getMonacoValue(app.page);
    expect(value).toContain('sphere');
  });

  test('syntax highlighting is active', async ({ app }) => {
    await waitForMonacoReady(app.page);
    const tokenCount = await app.page
      .locator(
        '.monaco-editor .mtk1, .monaco-editor .mtk4, .monaco-editor .mtk5, .monaco-editor .mtk6, .monaco-editor .mtk7, .monaco-editor .mtk8, .monaco-editor .mtk9, .monaco-editor .mtk10'
      )
      .count();
    expect(tokenCount).toBeGreaterThan(0);
  });

  test('line numbers visible', async ({ app }) => {
    await waitForMonacoReady(app.page);
    const lineNumberCount = await app.page.locator('.monaco-editor .line-numbers').count();
    expect(lineNumberCount).toBeGreaterThan(0);
  });

  test('can select all text', async ({ app }) => {
    await waitForMonacoReady(app.page);
    await selectAllInEditor(app.page);
    const selectionInfo = await app.page.evaluate(() => {
      const editor = (window as any).__TEST_EDITOR__;
      const model = editor?.getModel();
      const selection = editor?.getSelection();
      const fullRange = model?.getFullModelRange();
      return {
        hasSelection: Boolean(selection && !selection.isEmpty()),
        matchesFullRange:
          Boolean(selection && fullRange) &&
          selection.startLineNumber === fullRange.startLineNumber &&
          selection.startColumn === fullRange.startColumn &&
          selection.endLineNumber === fullRange.endLineNumber &&
          selection.endColumn === fullRange.endColumn,
      };
    });

    expect(selectionInfo.hasSelection).toBe(true);
    expect(selectionInfo.matchesFullRange).toBe(true);
  });

  test('editor responds to focus', async ({ app }) => {
    await waitForMonacoReady(app.page);
    const hasFocus = await app.page.evaluate(() => {
      const editor = (window as any).__TEST_EDITOR__;
      if (!editor) return false;
      editor.focus();
      return editor.hasTextFocus();
    });
    expect(hasFocus).toBe(true);
  });
});
