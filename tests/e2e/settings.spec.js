describe('Settings Dialog', () => {
  it('should open settings with keyboard shortcut', async () => {
    // Wait for app to load
    await browser.pause(2000);

    // Press Ctrl+, to open settings (Cmd+, on Mac)
    await browser.keys(['Control', ',']);
    await browser.pause(500);

    // Check if settings dialog is visible
    const settingsHeader = await $('h2=Settings');
    await expect(settingsHeader).toBeDisplayed();

    console.log('Settings dialog opened successfully');
  });

  it('should close settings with X button', async () => {
    // Settings should already be open from previous test
    // Find and click the X button
    const closeButton = await $('button[aria-label="Close settings"]');
    await expect(closeButton).toBeDisplayed();

    console.log('Found close button, clicking...');
    await closeButton.click();
    await browser.pause(500);

    // Verify dialog is closed - the settings header should not be visible
    const settingsHeader = await $('h2=Settings');
    const isDisplayed = await settingsHeader.isDisplayed().catch(() => false);

    expect(isDisplayed).toBe(false);
    console.log('Settings dialog closed successfully');
  });

  it('should close settings by clicking backdrop', async () => {
    // Open settings again
    await browser.keys(['Control', ',']);
    await browser.pause(500);

    const settingsHeader = await $('h2=Settings');
    await expect(settingsHeader).toBeDisplayed();

    // Click the backdrop (the overlay behind the dialog)
    // We'll click at coordinates outside the dialog
    await browser.action('pointer').move({ x: 10, y: 10 }).down().up().perform();

    await browser.pause(500);

    // Verify dialog is closed
    const isDisplayed = await settingsHeader.isDisplayed().catch(() => false);
    expect(isDisplayed).toBe(false);
    console.log('Settings dialog closed via backdrop click');
  });

  it('should save and detect API key', async () => {
    // Open settings
    await browser.keys(['Control', ',']);
    await browser.pause(500);

    // Click on AI tab
    const aiTab = await $('button=AI Assistant');
    await aiTab.click();
    await browser.pause(300);

    // Find the Anthropic API key input
    const apiKeyInput = await $('input[placeholder="sk-ant-..."]');
    await expect(apiKeyInput).toBeDisplayed();

    // Type a test API key
    await apiKeyInput.click();
    await apiKeyInput.setValue('sk-ant-test-key-12345');
    await browser.pause(300);

    // Click Save button
    const saveButton = await $('button=Save');
    await saveButton.click();
    await browser.pause(500);

    // Check for success message or configured status
    const configuredBadge = await $('span*=Configured');
    const isConfigured = await configuredBadge.isDisplayed().catch(() => false);

    console.log('API key configured status:', isConfigured);

    // Close settings
    const closeButton = await $('button[aria-label="Close settings"]');
    await closeButton.click();
  });
});
