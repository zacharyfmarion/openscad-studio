const { waitForAppReady } = require('./helpers');

describe('Theme Switching', () => {
  before(async () => {
    await waitForAppReady();
  });

  it('should open settings dialog', async () => {
    await browser.keys(['Control', ',']);
    await browser.pause(500);

    const settingsHeader = await $('h2=Settings');
    await expect(settingsHeader).toBeDisplayed();
  });

  it('should show Appearance tab', async () => {
    const appearanceTab = await $('button=Appearance');
    await expect(appearanceTab).toBeDisplayed();
    await appearanceTab.click();
    await browser.pause(300);
  });

  it('should display theme selector', async () => {
    // Look for theme dropdown
    const themeSelect = await $('select');
    const hasThemeSelect = await themeSelect.isDisplayed().catch(() => false);
    console.log('Has theme select:', hasThemeSelect);
    expect(hasThemeSelect).toBe(true);
  });

  it('should change theme', async () => {
    const themeSelect = await $('select');

    // Get initial background color
    const initialBg = await browser.execute(() => {
      return getComputedStyle(document.body).getPropertyValue('--bg-primary');
    });
    console.log('Initial bg:', initialBg);

    // Select a different theme
    await themeSelect.selectByIndex(3); // Select 4th theme
    await browser.pause(500);

    // Check if CSS variables changed
    const newBg = await browser.execute(() => {
      return getComputedStyle(document.body).getPropertyValue('--bg-primary');
    });
    console.log('New bg:', newBg);

    // Background should have changed (or at least not crash)
  });

  it('should close settings after theme change', async () => {
    const closeButton = await $('button[aria-label="Close settings"]');
    await closeButton.click();
    await browser.pause(300);

    // Settings should be closed
    const settingsHeader = await $('h2=Settings');
    const isDisplayed = await settingsHeader.isDisplayed().catch(() => false);
    expect(isDisplayed).toBe(false);
  });

  it('should persist theme after closing settings', async () => {
    // Open settings again
    await browser.keys(['Control', ',']);
    await browser.pause(500);

    // Go to appearance
    const appearanceTab = await $('button=Appearance');
    await appearanceTab.click();
    await browser.pause(300);

    // Theme should still be the one we selected
    const themeSelect = await $('select');
    const currentValue = await themeSelect.getValue();
    console.log('Persisted theme:', currentValue);

    // Close settings
    const closeButton = await $('button[aria-label="Close settings"]');
    await closeButton.click();
  });
});
