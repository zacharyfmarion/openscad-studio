/** @jest-environment jsdom */

import { jest } from '@jest/globals';

describe('platform bootstrap', () => {
  beforeEach(() => {
    jest.resetModules();
    delete (window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
  });

  it('exposes web bootstrap capabilities before initialization', async () => {
    const platform = await import('../index');

    expect(platform.getPlatform().capabilities).toEqual({
      multiFile: true,
      hasNativeMenu: false,
      hasFileSystem: false,
      canSetWindowTitle: true,
    });
  });

  it('exposes tauri bootstrap capabilities before initialization', async () => {
    (window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = {};
    const platform = await import('../index');

    expect(platform.getPlatform().capabilities).toEqual({
      multiFile: true,
      hasNativeMenu: true,
      hasFileSystem: true,
      canSetWindowTitle: true,
    });
  });

  it('initializes the web bridge once and caches it', async () => {
    const platform = await import('../index');
    const first = await platform.initializePlatform();
    const second = await platform.initializePlatform();

    expect(first).toBe(second);
    expect(first.capabilities.hasFileSystem).toBe(false);
    expect(platform.getPlatform()).toBe(first);
  });

  it('exposes the bootstrap bridge no-op filesystem and dialog methods before initialization', async () => {
    const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(true);
    const platform = await import('../index');
    const bridge = platform.getPlatform();

    await expect(bridge.fileOpen([{ name: 'OpenSCAD', extensions: ['scad'] }])).resolves.toBeNull();
    await expect(bridge.fileRead('/tmp/model.scad')).resolves.toBeNull();
    await expect(
      bridge.fileSave('cube(10);', '/tmp/model.scad', [], 'model.scad')
    ).resolves.toBeNull();
    await expect(bridge.fileSaveAs('cube(10);', [], 'model.scad')).resolves.toBeNull();
    await expect(bridge.fileExport(new Uint8Array([1]), 'model.stl', [])).resolves.toBeUndefined();
    await expect(bridge.confirm('Continue?', { title: 'Confirm' })).resolves.toBe(true);
    await expect(bridge.ask('Continue?', { title: 'Confirm' })).resolves.toBe(true);
    await expect(bridge.fileExists('/tmp/model.scad')).resolves.toBe(false);
    await expect(bridge.readTextFile('/tmp/model.scad')).resolves.toBeNull();
    await expect(bridge.readDirectoryFiles()).resolves.toEqual({});
    await expect(bridge.getLibraryPaths()).resolves.toEqual([]);
    await expect(bridge.pickDirectory()).resolves.toBeNull();

    bridge.setWindowTitle('Custom Title');
    expect(document.title).toBe('Custom Title');
    expect(typeof bridge.onCloseRequested(async () => true)).toBe('function');
    expect(confirmSpy).toHaveBeenCalledTimes(2);
  });

  it('selects the tauri bridge when tauri internals are present', async () => {
    (window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = {};
    const listen = jest.fn(async () => jest.fn());
    jest.unstable_mockModule('@tauri-apps/api/window', () => ({
      getCurrentWindow: () => ({
        listen,
      }),
    }));

    const platform = await import('../index');
    const initialized = await platform.initializePlatform();

    expect(initialized.capabilities.hasFileSystem).toBe(true);
    expect(initialized.capabilities.hasNativeMenu).toBe(true);
    expect(listen).toHaveBeenCalled();
  });
});
