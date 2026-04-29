import { test, expect } from '../../fixtures/app.fixture';
import { setMonacoValue } from '../../helpers/editor';
import * as fs from 'fs';
import * as path from 'path';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Read all .scad files from a fixture directory into a flat Record<relativePath, content>.
 * This is what the platform bridge's readDirectoryFiles() returns.
 */
function readFixtureDir(dirName: string): Record<string, string> {
  const dirPath = path.join(__dirname, '..', '..', 'fixtures', 'test-data', dirName);
  const files: Record<string, string> = {};

  function walk(dir: string, prefix: string) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        walk(path.join(dir, entry.name), rel);
      } else if (entry.name.endsWith('.scad')) {
        files[rel] = fs.readFileSync(path.join(dir, entry.name), 'utf-8');
      }
    }
  }
  walk(dirPath, '');
  return files;
}

/**
 * Read a single fixture file.
 */
function readFixture(fixturePath: string): string {
  return fs.readFileSync(
    path.join(__dirname, '..', '..', 'fixtures', 'test-data', fixturePath),
    'utf-8'
  );
}

/**
 * Ensure the Console/Diagnostics tab is visible.
 */
async function ensureDiagnosticsVisible(page: import('@playwright/test').Page) {
  const consoleTab = page.locator('.dv-tab').filter({ hasText: 'Console' });
  if (await consoleTab.isVisible({ timeout: 2000 }).catch(() => false)) {
    await consoleTab.click();
    await page.waitForTimeout(300);
  }
}

/**
 * Ensure the Preview tab is visible after inspecting diagnostics. In the
 * AI-first layout, Console and Preview are tabs in the same Dockview group.
 */
async function ensurePreviewVisible(page: import('@playwright/test').Page) {
  const previewTab = page.locator('.dv-tab').filter({ hasText: 'Preview' });
  if (await previewTab.isVisible({ timeout: 2000 }).catch(() => false)) {
    await previewTab.click();
    await page.waitForTimeout(300);
  }
}

// ---------------------------------------------------------------------------
// Tests for nested include resolution (Issue #20)
// ---------------------------------------------------------------------------

test.describe('Include Path Resolution', () => {
  // All tests need longer timeout since they involve WASM rendering with aux files
  test.setTimeout(60_000);

  test('resolves sibling includes within a library (BOSL2 pattern)', async ({ app }) => {
    // Wait for initial render to complete (WASM ready)
    await app.waitForRender();

    // Read the mock library files — simulates what readDirectoryFiles() returns
    // Structure: mylib/std.scad includes <shapes.scad> (sibling)
    const auxFiles = readFixtureDir('includes');
    // Remove the main-*.scad files — those are the "user" files, not library files
    const libraryFiles = Object.fromEntries(
      Object.entries(auxFiles).filter(([k]) => !k.startsWith('main-'))
    );

    // Inject auxiliary files into the render pipeline
    await app.page.evaluate((files) => {
      (window as any).__TEST_OPENSCAD__?.setTestAuxiliaryFiles(files);
    }, libraryFiles);

    // Set the main file content that includes the library
    const mainCode = readFixture('includes/main-include.scad');
    await setMonacoValue(app.page, mainCode);
    await app.focusEditor();
    await app.triggerRender();
    await app.waitForRender();

    // Check diagnostics panel for include-related warnings
    await ensureDiagnosticsVisible(app.page);
    const diagnosticsPanel = app.page.locator('[data-testid="diagnostics-panel"]');

    // Poll diagnostics text — should NOT contain "Can't open include file"
    const diagnosticsText = await diagnosticsPanel.textContent().catch(() => '');
    expect(diagnosticsText).not.toContain("Can't open include file");

    // The render should succeed — preview canvas should be visible
    await ensurePreviewVisible(app.page);
    await expect(app.previewCanvas3D).toBeVisible();
  });

  test('resolves deeply nested includes (3 levels)', async ({ app }) => {
    // Wait for initial render to complete
    await app.waitForRender();

    // Read library files: mylib/entry.scad -> mylib/sub/deep.scad
    const auxFiles = readFixtureDir('includes');
    const libraryFiles = Object.fromEntries(
      Object.entries(auxFiles).filter(([k]) => !k.startsWith('main-'))
    );

    await app.page.evaluate((files) => {
      (window as any).__TEST_OPENSCAD__?.setTestAuxiliaryFiles(files);
    }, libraryFiles);

    const mainCode = readFixture('includes/main-nested.scad');
    await setMonacoValue(app.page, mainCode);
    await app.focusEditor();
    await app.triggerRender();
    await app.waitForRender();

    await ensureDiagnosticsVisible(app.page);
    const diagnosticsPanel = app.page.locator('[data-testid="diagnostics-panel"]');
    const diagnosticsText = await diagnosticsPanel.textContent().catch(() => '');
    expect(diagnosticsText).not.toContain("Can't open include file");

    await ensurePreviewVisible(app.page);
    await expect(app.previewCanvas3D).toBeVisible();
  });

  test('resolves use<> with library files', async ({ app }) => {
    // Wait for initial render to complete
    await app.waitForRender();

    // use<> imports functions/modules without executing top-level code
    const auxFiles = readFixtureDir('includes');
    const libraryFiles = Object.fromEntries(
      Object.entries(auxFiles).filter(([k]) => !k.startsWith('main-'))
    );

    await app.page.evaluate((files) => {
      (window as any).__TEST_OPENSCAD__?.setTestAuxiliaryFiles(files);
    }, libraryFiles);

    const mainCode = readFixture('includes/main-use.scad');
    await setMonacoValue(app.page, mainCode);
    await app.focusEditor();
    await app.triggerRender();
    await app.waitForRender();

    await ensureDiagnosticsVisible(app.page);
    const diagnosticsPanel = app.page.locator('[data-testid="diagnostics-panel"]');
    const diagnosticsText = await diagnosticsPanel.textContent().catch(() => '');
    expect(diagnosticsText).not.toContain("Can't open include file");
    expect(diagnosticsText).not.toContain("Can't open library");

    await ensurePreviewVisible(app.page);
    await expect(app.previewCanvas3D).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Tests with real BOSL2 files (validates full library loading)
// ---------------------------------------------------------------------------

/**
 * Read all .scad files from a directory on the test machine.
 * Keys are relative paths with the root dir name included.
 * e.g. readLibraryDir('/path/to/BOSL2') -> { 'BOSL2/std.scad': '...', ... }
 */
function readLibraryDir(libRootPath: string): Record<string, string> | null {
  if (!fs.existsSync(libRootPath)) return null;
  const rootName = path.basename(libRootPath);
  const files: Record<string, string> = {};

  function walk(dir: string, prefix: string) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('.')) continue; // skip hidden dirs/files
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        walk(path.join(dir, entry.name), rel);
      } else if (entry.name.endsWith('.scad')) {
        files[rel] = fs.readFileSync(path.join(dir, entry.name), 'utf-8');
      }
    }
  }
  walk(libRootPath, rootName);
  return files;
}

test.describe('BOSL2 Library Integration', () => {
  test.setTimeout(120_000);

  // Path where BOSL2 would be installed on macOS
  const bosl2Path = path.join(
    process.env.HOME || '',
    'Documents',
    'OpenSCAD',
    'libraries',
    'BOSL2'
  );

  test('loads and resolves BOSL2 std.scad includes', async ({ app }) => {
    const bosl2Files = readLibraryDir(bosl2Path);
    test.skip(!bosl2Files, 'BOSL2 not installed at ' + bosl2Path);

    // Wait for initial render to complete (WASM ready)
    await app.waitForRender();

    const fileCount = Object.keys(bosl2Files!).length;
    expect(fileCount).toBeGreaterThan(50); // BOSL2 has ~56 core + tests/examples

    // Inject all BOSL2 files as auxiliary files
    await app.page.evaluate((files) => {
      (window as any).__TEST_OPENSCAD__?.setTestAuxiliaryFiles(files);
    }, bosl2Files);

    // Set code that uses BOSL2
    const mainCode = 'include <BOSL2/std.scad>\ncuboid([10,10,10]);';
    await setMonacoValue(app.page, mainCode);
    await app.focusEditor();
    await app.triggerRender();
    await app.waitForRender({ timeout: 60_000 });

    // Check diagnostics — should NOT have any include warnings
    await ensureDiagnosticsVisible(app.page);
    const diagnosticsPanel = app.page.locator('[data-testid="diagnostics-panel"]');
    const diagnosticsText = await diagnosticsPanel.textContent().catch(() => '');

    // Fail with useful info if includes didn't resolve
    const includeWarnings = (diagnosticsText || '')
      .split('\n')
      .filter(
        (line) => line.includes("Can't open include file") || line.includes("Can't open library")
      );
    if (includeWarnings.length > 0) {
      console.error('Include resolution failures:', includeWarnings);
    }
    expect(includeWarnings).toHaveLength(0);

    // The render should produce a visible 3D preview
    await ensurePreviewVisible(app.page);
    await expect(app.previewCanvas3D).toBeVisible();
  });

  test('BOSL2 cuboid renders without errors', async ({ app }) => {
    const bosl2Files = readLibraryDir(bosl2Path);
    test.skip(!bosl2Files, 'BOSL2 not installed at ' + bosl2Path);

    await app.waitForRender();

    await app.page.evaluate((files) => {
      (window as any).__TEST_OPENSCAD__?.setTestAuxiliaryFiles(files);
    }, bosl2Files);

    // Use a simple BOSL2 module that exercises the include chain
    const mainCode = [
      'include <BOSL2/std.scad>',
      '',
      'cuboid([20, 10, 5], rounding=1, edges="Z");',
    ].join('\n');
    await setMonacoValue(app.page, mainCode);
    await app.focusEditor();
    await app.triggerRender();
    await app.waitForRender({ timeout: 60_000 });

    // Should render without any errors
    const hasError = await app.page.evaluate(() => {
      const el = document.querySelector('[data-testid="diagnostics-panel"]');
      return el?.textContent?.includes('error') ?? false;
    });
    expect(hasError).toBe(false);

    await expect(app.previewCanvas3D).toBeVisible();
  });
});
