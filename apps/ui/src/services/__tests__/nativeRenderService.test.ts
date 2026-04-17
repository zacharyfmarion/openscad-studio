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

  it('forwards syntax-check render context to the native invoke call', async () => {
    invoke.mockImplementation(async (command: string, payload?: Record<string, unknown>) => {
      if (command === 'render_init') return 'OpenSCAD 2026.03.16';
      if (command === 'render_native') {
        return {
          output: [],
          stderr: 'WARNING: include note',
          exit_code: 0,
          duration_ms: 1,
          payload,
        };
      }
      throw new Error(`Unexpected command: ${command}`);
    });

    const { NativeRenderService } = await import('../nativeRenderService');
    const service = new NativeRenderService();

    await expect(
      service.checkSyntax('use <shared.scad>;\ncube(10);', {
        auxiliaryFiles: { 'shared.scad': 'module helper() {}' },
        libraryFiles: { 'libraries/util.scad': 'module util() {}' },
        inputPath: 'models/main.scad',
        workingDir: '/workspace',
        libraryPaths: ['/lib/system'],
      })
    ).resolves.toEqual({
      diagnostics: [
        {
          severity: 'warning',
          line: undefined,
          col: undefined,
          message: 'WARNING: include note',
        },
      ],
    });

    expect(invoke).toHaveBeenCalledWith(
      'render_native',
      expect.objectContaining({
        auxiliaryFiles: {
          'shared.scad': 'module helper() {}',
          'libraries/util.scad': 'module util() {}',
        },
        inputPath: 'models/main.scad',
        workingDir: '/workspace',
        libraryPaths: ['/lib/system'],
      })
    );
  });

  it('retries syntax checks in 2D mode when the 3D pass only reports a top-level mismatch', async () => {
    invoke.mockImplementation(async (command: string) => {
      if (command === 'render_init') return 'OpenSCAD 2026.03.16';
      if (command === 'render_native') {
        const renderCalls = invoke.mock.calls.filter(([name]) => name === 'render_native').length;
        return {
          output: [],
          stderr:
            renderCalls === 1 ? 'Current top level object is not a 3D object.' : 'WARNING: 2D note',
          exit_code: 0,
          duration_ms: 1,
        };
      }
      throw new Error(`Unexpected command: ${command}`);
    });

    const { NativeRenderService } = await import('../nativeRenderService');
    const service = new NativeRenderService();

    await expect(service.checkSyntax('square(10);')).resolves.toEqual({
      diagnostics: [
        {
          severity: 'warning',
          line: undefined,
          col: undefined,
          message: 'WARNING: 2D note',
        },
      ],
    });

    const nativeCalls = invoke.mock.calls.filter(([command]) => command === 'render_native');
    expect(nativeCalls).toHaveLength(2);
    expect(nativeCalls[0][1]).toEqual(
      expect.objectContaining({
        args: ['/input.scad', '-o', '/output.stl', '--backend=manifold'],
      })
    );
    expect(nativeCalls[1][1]).toEqual(
      expect.objectContaining({
        args: ['/input.scad', '-o', '/output.svg', '--backend=manifold'],
      })
    );
  });
});
