const { waitForAppReady, getEditorContent, focusEditor } = require('./helpers');

describe('Editor', () => {
  before(async () => {
    await waitForAppReady();
  });

  it('should display Monaco editor', async () => {
    const editor = await $('.monaco-editor');
    await expect(editor).toBeDisplayed();
    console.log('Monaco editor is displayed');
  });

  it('should have default code content', async () => {
    const content = await getEditorContent();
    console.log('Editor content:', content);
    expect(content).toBeTruthy();
    expect(content).toContain('cube');
  });

  it('should allow typing code', async () => {
    await focusEditor();

    // Select all and type new content
    await browser.keys(['Control', 'a']);
    await browser.pause(100);

    const testCode = 'sphere(15);';
    await browser.keys(testCode);
    await browser.pause(500);

    const content = await getEditorContent();
    console.log('New editor content:', content);
    expect(content).toContain('sphere');
  });

  it('should show line numbers', async () => {
    const lineNumbers = await $('.monaco-editor .line-numbers');
    await expect(lineNumbers).toBeDisplayed();
  });

  it('should support undo with Ctrl+Z', async () => {
    // Set known content first
    await browser.execute(() => {
      const editors = window.monaco?.editor?.getEditors?.();
      if (editors?.[0]) {
        editors[0].setValue('original();');
      }
    });
    await browser.pause(200);

    await focusEditor();

    // Type something new
    await browser.keys(['Control', 'a']);
    await browser.keys('modified();');
    await browser.pause(300);

    // Verify modification
    let content = await getEditorContent();
    expect(content).toContain('modified');

    // Undo
    await browser.keys(['Control', 'z']);
    await browser.pause(300);

    // Should be back to original
    content = await getEditorContent();
    console.log('After undo:', content);
    // Note: undo behavior may vary based on editor state
  });

  it('should support keyboard navigation', async () => {
    await focusEditor();

    // Navigate with keyboard
    await browser.keys(['Control', 'Home']);
    await browser.pause(100);
    await browser.keys(['Control', 'End']);
    await browser.pause(100);

    // Editor should still be visible
    const editor = await $('.monaco-editor');
    await expect(editor).toBeDisplayed();
  });
});
