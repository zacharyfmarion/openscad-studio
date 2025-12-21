const { waitForAppReady, focusEditor, setEditorContent } = require('./helpers');

describe('Preview Panel', () => {
  before(async () => {
    await waitForAppReady();
  });

  it('should display preview area', async () => {
    // Look for preview container, canvas, or image
    const canvas = await $('canvas');
    const hasCanvas = await canvas.isDisplayed().catch(() => false);

    const img = await $('img');
    const hasImage = await img.isDisplayed().catch(() => false);

    console.log('Has canvas:', hasCanvas, 'Has image:', hasImage);
    expect(hasCanvas || hasImage).toBe(true);
  });

  it('should render preview when code is set', async () => {
    // Set valid OpenSCAD code
    await setEditorContent('cube([20, 20, 20]);');
    await browser.pause(2000); // Wait for render

    // Check that visual output exists
    const canvas = await $('canvas');
    const hasCanvas = await canvas.isDisplayed().catch(() => false);

    const img = await $('img');
    const hasImage = await img.isDisplayed().catch(() => false);

    console.log('After render - Has canvas:', hasCanvas, 'Has image:', hasImage);
    expect(hasCanvas || hasImage).toBe(true);
  });

  it('should update preview when code changes', async () => {
    // Change to different shape
    await setEditorContent('sphere(10);');
    await browser.pause(2000);

    // Preview should still exist
    const previewExists = await browser.execute(() => {
      return document.querySelector('canvas') !== null || document.querySelector('img') !== null;
    });

    expect(previewExists).toBe(true);
  });

  it('should show render button', async () => {
    // Look for render button
    const renderButton = await $('button*=Render');
    const hasRenderButton = await renderButton.isDisplayed().catch(() => false);
    console.log('Has render button:', hasRenderButton);
    expect(hasRenderButton).toBe(true);
  });

  it('should have export button', async () => {
    const exportButton = await $('button*=Export');
    const hasExportButton = await exportButton.isDisplayed().catch(() => false);
    console.log('Has export button:', hasExportButton);
    expect(hasExportButton).toBe(true);
  });
});
