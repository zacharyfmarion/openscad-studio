import { Page } from '@playwright/test';

// ---------------------------------------------------------------------------
// Monaco Editor helpers for E2E tests
// ---------------------------------------------------------------------------

/**
 * Get Monaco editor value.
 * Uses clipboard-based extraction as a reliable fallback.
 */
export async function getMonacoValue(page: Page): Promise<string> {
  const value = await page.evaluate(() => {
    const editor = (window as any).__TEST_EDITOR__;
    if (editor) return editor.getValue();
    return null;
  });

  if (value !== null) return value;

  // Fallback: select all + copy from clipboard
  const textarea = page.locator('.monaco-editor textarea.inputarea').first();
  await textarea.click();
  await page.keyboard.press('Meta+A');
  await page.keyboard.press('Meta+C');
  await page.waitForTimeout(100);

  const clipboardText = await page.evaluate(() => navigator.clipboard.readText()).catch(() => '');
  return clipboardText;
}

/**
 * Set Monaco editor value.
 * Uses clipboard-based paste as reliable fallback.
 */
export async function setMonacoValue(page: Page, value: string): Promise<void> {
  await page.evaluate(() => {
    (window as any).__PLAYWRIGHT__ = true;
  });

  const success = await page.evaluate((text) => {
    const editor = (window as any).__TEST_EDITOR__;
    if (editor) {
      const model = editor.getModel();
      if (model) {
        // Use pushEditOperations instead of setValue to properly trigger
        // onDidChangeModelContent and the React onChange handler.
        // This ensures the app's state (source code, diagnostics) stays in sync.
        const fullRange = model.getFullModelRange();
        model.pushEditOperations(
          [],
          [{ range: fullRange, text }],
          () => null
        );
        return true;
      }
      // Fallback: use setValue (may not trigger onChange in @monaco-editor/react)
      editor.setValue(text);
      return true;
    }
    return false;
  }, value);

  if (success) {
    await page.waitForTimeout(200);
    return;
  }

  // Fallback: select all, delete, then paste via clipboard
  const textarea = page.locator('.monaco-editor textarea.inputarea').first();
  await textarea.click();
  await page.keyboard.press('Meta+A');
  await page.keyboard.press('Backspace');
  await page.waitForTimeout(50);

  // Write to clipboard and paste
  await page.evaluate((text) => navigator.clipboard.writeText(text), value);
  await page.keyboard.press('Meta+V');
  await page.waitForTimeout(200);
}

export async function setMonacoValueUndoable(page: Page, value: string): Promise<void> {
  await page.evaluate(() => {
    (window as any).__PLAYWRIGHT__ = true;
  });

  const success = await page.evaluate((text) => {
    const editor = (window as any).__TEST_EDITOR__;
    if (!editor) return false;
    const model = editor.getModel();
    if (!model) return false;
    editor.executeEdits('playwright', [
      {
        range: model.getFullModelRange(),
        text,
      },
    ]);
    return true;
  }, value);

  if (success) {
    await page.waitForTimeout(100);
    return;
  }

  await setMonacoValue(page, value);
}

/**
 * Check whether Monaco editor has any error decorations (red squiggles).
 */
export async function hasEditorErrors(page: Page): Promise<boolean> {
  // Check for Monaco error decoration classes
  const hasErrors = await page.evaluate(() => {
    // Via API
    const editor = (window as any).__TEST_EDITOR__;
    if (editor) {
      const model = editor.getModel();
      if (model) {
        const markers =
          (window as any).__TEST_MONACO__?.editor?.getModelMarkers({ resource: model.uri }) ?? [];
        return markers.some((m: any) => m.severity >= 8);
      }
    }
    // Fallback: check for error squiggle CSS classes
    return document.querySelectorAll('.squiggly-error').length > 0;
  });
  return hasErrors;
}

/**
 * Get all Monaco markers (diagnostics).
 */
export async function getMonacoMarkers(page: Page): Promise<
  Array<{
    severity: number;
    message: string;
    startLineNumber: number;
  }>
> {
  return page.evaluate(() => {
    const editor = (window as any).__TEST_EDITOR__;
    if (!editor) return [];
    const model = editor.getModel();
    if (!model) return [];
    return (
      (window as any).__TEST_MONACO__?.editor?.getModelMarkers({ resource: model.uri }) ?? []
    ).map((m: any) => ({
      severity: m.severity,
      message: m.message,
      startLineNumber: m.startLineNumber,
    }));
  });
}

/**
 * Wait for Monaco editor to be fully initialized.
 * Does NOT require window.monaco — uses DOM detection.
 */
export async function waitForMonacoReady(page: Page, timeout = 30_000): Promise<void> {
  // Wait for the Monaco editor container to be present in the DOM
  await page.waitForSelector('.monaco-editor', { timeout });
  // Then wait for it to be fully initialized with content lines
  await page.waitForSelector('.monaco-editor .view-lines', { timeout: 15_000 }).catch(() => {
    // .view-lines may not appear until the editor panel has focus/size
    // Just having .monaco-editor present is sufficient
  });
  // Wait for the textarea (input receiver) to be available
  await page.waitForSelector('.monaco-editor textarea.inputarea', { timeout: 10_000 });
  await page.waitForTimeout(300);
}

/**
 * Type into the editor using keyboard (for realistic input tests).
 */
export async function typeInEditor(page: Page, text: string): Promise<void> {
  await page.evaluate(() => {
    const editor = (window as any).__TEST_EDITOR__;
    if (editor) editor.focus();
  });
  await page.waitForTimeout(100);
  await page.keyboard.type(text, { delay: 10 });
}

/**
 * Select all text in the editor.
 */
export async function selectAllInEditor(page: Page): Promise<void> {
  await page.evaluate(() => {
    const editor = (window as any).__TEST_EDITOR__;
    if (!editor) return;
    editor.focus();
    const model = editor.getModel();
    if (model) {
      editor.setSelection(model.getFullModelRange());
    }
  });
}
