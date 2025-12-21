/**
 * Shared test helpers for E2E tests
 */

/**
 * Waits for the app to load and dismisses any initial screens
 * (OpenSCAD setup screen, welcome screen)
 */
async function waitForAppReady() {
  // Wait for initial load
  await browser.pause(3000);

  // Check for OpenSCAD setup screen ("OpenSCAD Not Found")
  const setupScreen = await $('h1*=OpenSCAD');
  const hasSetupScreen = await setupScreen.isDisplayed().catch(() => false);

  if (hasSetupScreen) {
    console.log('OpenSCAD setup screen detected');
    const continueButton = await $('button*=Continue');
    if (await continueButton.isDisplayed().catch(() => false)) {
      await continueButton.click();
      await browser.pause(1000);
    }
  }

  // Check for welcome screen ("What do you want to create?")
  const welcomeHeading = await $('h1*=What do you want to create');
  const hasWelcomeScreen = await welcomeHeading.isDisplayed().catch(() => false);

  if (hasWelcomeScreen) {
    console.log('Welcome screen detected, clicking Start with empty project...');
    // The button text contains an arrow character
    const startButton = await $('button*=Start with empty project');
    if (await startButton.isDisplayed().catch(() => false)) {
      await startButton.click();
      console.log('Clicked Start with empty project');
      await browser.pause(2000);
    } else {
      console.log('Start button not found, trying alternative...');
      // Try to find button by partial text
      const buttons = await $$('button');
      for (const btn of buttons) {
        const text = await btn.getText().catch(() => '');
        if (text.includes('Start') || text.includes('empty')) {
          console.log('Found button with text:', text);
          await btn.click();
          await browser.pause(2000);
          break;
        }
      }
    }
  }

  // Wait for Monaco editor to initialize
  await browser
    .waitUntil(
      async () => {
        const editor = await $('.monaco-editor');
        return editor.isDisplayed().catch(() => false);
      },
      {
        timeout: 15000,
        timeoutMsg: 'Monaco editor did not appear within 15s',
        interval: 500,
      }
    )
    .catch((err) => {
      console.log('Warning: Monaco editor not found:', err.message);
    });

  // Extra pause for Monaco to fully initialize
  await browser.pause(1000);
}

/**
 * Gets the current Monaco editor content
 */
async function getEditorContent() {
  return browser.execute(() => {
    const editors = window.monaco?.editor?.getEditors?.();
    if (editors && editors.length > 0) {
      return editors[0].getValue();
    }
    return null;
  });
}

/**
 * Sets the Monaco editor content
 */
async function setEditorContent(content) {
  return browser.execute((code) => {
    const editors = window.monaco?.editor?.getEditors?.();
    if (editors && editors.length > 0) {
      editors[0].setValue(code);
      return true;
    }
    return false;
  }, content);
}

/**
 * Clicks in the editor to focus it
 */
async function focusEditor() {
  const editor = await $('.monaco-editor .view-lines');
  if (await editor.isDisplayed().catch(() => false)) {
    await editor.click();
    await browser.pause(100);
    return true;
  }
  return false;
}

module.exports = {
  waitForAppReady,
  getEditorContent,
  setEditorContent,
  focusEditor,
};
