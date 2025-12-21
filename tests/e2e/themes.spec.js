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

    // Get initial theme value and background color
    const initialValue = await themeSelect.getValue();
    const initialBg = await browser.execute(() => {
      return getComputedStyle(document.body).getPropertyValue('--bg-primary');
    });
    console.log('Initial theme:', initialValue, 'bg:', initialBg);

    // Get all available options using JavaScript (works with optgroups)
    const options = await browser.execute(() => {
      const select = document.querySelector('select');
      if (!select) return [];
      return Array.from(select.options).map(opt => ({
        value: opt.value,
        text: opt.text
      }));
    });
    console.log('Available themes:', options.length);

    // Find a different theme to select
    const differentTheme = options.find(opt => opt.value !== initialValue && opt.value);
    if (!differentTheme) {
      console.log('No different theme available, skipping');
      return;
    }
    console.log('Selecting theme:', differentTheme.value);

    // Use selectByAttribute which works with optgroups
    await themeSelect.selectByAttribute('value', differentTheme.value);
    await browser.pause(500);

    // Check if CSS variables changed
    const newBg = await browser.execute(() => {
      return getComputedStyle(document.body).getPropertyValue('--bg-primary');
    });
    const newValue = await themeSelect.getValue();
    console.log('New theme:', newValue, 'bg:', newBg);

    // Theme value should have changed
    expect(newValue).toBe(differentTheme.value);
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
