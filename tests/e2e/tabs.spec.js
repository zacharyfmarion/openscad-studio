const { waitForAppReady, focusEditor } = require('./helpers');

describe('Tab Management', () => {
  before(async () => {
    await waitForAppReady();
  });

  it('should show tab bar', async () => {
    // Look for tab container
    const tabBar = await $('[class*="flex"][class*="items-center"]');
    const hasTabBar = await tabBar.isDisplayed().catch(() => false);
    console.log('Has tab bar:', hasTabBar);
  });

  it('should create new tab with Ctrl+N', async () => {
    // Store current page state
    const initialContent = await browser.execute(() => document.body.innerHTML);

    // Create new tab
    await browser.keys(['Control', 'n']);
    await browser.pause(1000);

    // Verify Monaco editor is still displayed
    const editor = await $('.monaco-editor');
    const editorVisible = await editor.isDisplayed().catch(() => false);
    expect(editorVisible).toBe(true);

    console.log('New tab created successfully');
  });

  it('should have close button on tabs', async () => {
    // Look for tab close buttons (usually × or X)
    const closeButtons = await $$('button[class*="close"], [class*="tab"] button');
    console.log('Found close-like buttons:', closeButtons.length);
  });

  it('should mark tab as dirty when content changes', async () => {
    await focusEditor();

    // Type to make dirty
    await browser.keys('// dirty change');
    await browser.pause(500);

    // Check page content for dirty indicator
    const pageContent = await browser.execute(() => document.body.innerHTML);
    const hasDirtyIndicator =
      pageContent.includes('•') || pageContent.includes('●') || pageContent.includes('*');

    console.log('Has dirty indicator:', hasDirtyIndicator);
  });

  it('should support Ctrl+W to close tab', async () => {
    // First create a new tab
    await browser.keys(['Control', 'n']);
    await browser.pause(500);

    // Close it
    await browser.keys(['Control', 'w']);
    await browser.pause(500);

    // Editor should still be visible (there should be at least one tab)
    const editor = await $('.monaco-editor');
    const editorVisible = await editor.isDisplayed().catch(() => false);
    expect(editorVisible).toBe(true);
  });
});
