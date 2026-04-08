/** @jest-environment jsdom */

import { jest } from '@jest/globals';
import { webcrypto } from 'node:crypto';
import { TextDecoder, TextEncoder } from 'node:util';

const invoke = jest.fn();

beforeAll(() => {
  Object.defineProperty(globalThis, 'TextEncoder', {
    configurable: true,
    writable: true,
    value: TextEncoder,
  });
  Object.defineProperty(globalThis, 'TextDecoder', {
    configurable: true,
    writable: true,
    value: TextDecoder,
  });
  Object.defineProperty(globalThis, 'crypto', {
    configurable: true,
    writable: true,
    value: webcrypto,
  });
});

describe('NativeRenderService', () => {
  beforeEach(() => {
    jest.resetModules();
    invoke.mockReset();
    jest.unstable_mockModule('@tauri-apps/api/core', () => ({
      invoke,
    }));
  });

  it('invalidates cached renders when an auxiliary file changes but the file count stays the same', async () => {
    let renderCount = 0;
    invoke.mockImplementation(async (command: string) => {
      if (command === 'render_init') return 'OpenSCAD 2026.03.16';
      if (command === 'render_native') {
        renderCount += 1;
        return {
          output: [renderCount],
          stderr: '',
          exit_code: 0,
          duration_ms: 1,
        };
      }
      throw new Error(`Unexpected command: ${command}`);
    });

    const { NativeRenderService } = await import('../nativeRenderService');
    const service = new NativeRenderService();

    await expect(
      service.render('include <dep.scad>\ncube(size);', {
        view: '3d',
        auxiliaryFiles: {
          'dep.scad': 'size = 10;',
        },
      })
    ).resolves.toEqual({
      output: new Uint8Array([1]),
      kind: 'mesh',
      diagnostics: [],
    });

    await expect(
      service.render('include <dep.scad>\ncube(size);', {
        view: '3d',
        auxiliaryFiles: {
          'dep.scad': 'size = 20;',
        },
      })
    ).resolves.toEqual({
      output: new Uint8Array([2]),
      kind: 'mesh',
      diagnostics: [],
    });

    expect(invoke.mock.calls.filter(([command]) => command === 'render_native')).toHaveLength(2);
  });

  it('invalidates cached renders when the render target path changes', async () => {
    let renderCount = 0;
    invoke.mockImplementation(async (command: string) => {
      if (command === 'render_init') return 'OpenSCAD 2026.03.16';
      if (command === 'render_native') {
        renderCount += 1;
        return {
          output: [renderCount],
          stderr: '',
          exit_code: 0,
          duration_ms: 1,
        };
      }
      throw new Error(`Unexpected command: ${command}`);
    });

    const { NativeRenderService } = await import('../nativeRenderService');
    const service = new NativeRenderService();

    await service.render('include <dep.scad>\ncube(size);', {
      view: '3d',
      inputPath: 'variants/a/main.scad',
      auxiliaryFiles: {
        'variants/a/dep.scad': 'size = 10;',
      },
    });

    await expect(
      service.getCached('include <dep.scad>\ncube(size);', {
        view: '3d',
        inputPath: 'variants/b/main.scad',
        auxiliaryFiles: {
          'variants/b/dep.scad': 'size = 10;',
        },
      })
    ).resolves.toBeNull();
  });
});
