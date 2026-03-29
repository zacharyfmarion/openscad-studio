/** @jest-environment jsdom */

import { act, render, waitFor } from '@testing-library/react';
import { jest } from '@jest/globals';
import { useOpenScad } from '../useOpenScad';

type MockRenderResult = {
  output: Uint8Array;
  kind: 'mesh' | 'svg';
  diagnostics: Array<{ severity: 'error' | 'warning' | 'info'; message: string }>;
};

function createHarness(options?: Parameters<typeof useOpenScad>[0]) {
  let latest: ReturnType<typeof useOpenScad>;

  function Harness() {
    latest = useOpenScad(options);
    return null;
  }

  render(<Harness />);

  return {
    current() {
      return latest!;
    },
  };
}

describe('useOpenScad', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    globalThis.URL.createObjectURL = jest.fn(() => 'blob:preview');
    globalThis.URL.revokeObjectURL = jest.fn();
    window.__PLAYWRIGHT__ = false;
  });

  it('initializes the render service and performs the initial render by default', async () => {
    const analytics = { track: jest.fn(), trackError: jest.fn(), setAnalyticsEnabled: jest.fn() };
    const renderService = {
      init: jest.fn(async () => undefined),
      getCached: jest.fn(async () => null),
      render: jest.fn(async (): Promise<MockRenderResult> => ({
        output: new Uint8Array([1]),
        kind: 'mesh',
        diagnostics: [],
      })),
    };

    const hook = createHarness({
      testOverrides: {
        analytics,
        renderService: renderService as never,
      },
    });

    await waitFor(() => {
      expect(hook.current().ready).toBe(true);
    });

    expect(renderService.init).toHaveBeenCalledTimes(1);
    expect(renderService.render).toHaveBeenCalledWith(
      '// Type your OpenSCAD code here\ncube([10, 10, 10]);',
      expect.objectContaining({ view: '3d', backend: 'manifold' })
    );
    expect(hook.current().previewSrc).toBe('blob:preview');
    expect(hook.current().previewKind).toBe('mesh');
    expect(analytics.track).toHaveBeenCalledWith(
      'render completed',
      expect.objectContaining({
        cache_hit: false,
        requested_dimension: '3d',
        resolved_dimension: '3d',
      })
    );
  });

  it('reports init failures through hook state and notifications', async () => {
    const notify = jest.fn();
    const renderService = {
      init: jest.fn(async () => {
        throw new Error('wasm init failed');
      }),
      getCached: jest.fn(async () => null),
      render: jest.fn(),
    };

    const hook = createHarness({
      suppressInitialRender: true,
      testOverrides: {
        renderService: renderService as never,
        notifyError: notify,
      },
    });

    await waitFor(() => {
      expect(hook.current().error).toContain('Failed to initialize OpenSCAD WASM');
    });

    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: 'openscad-init',
        fallbackMessage: 'Failed to initialize OpenSCAD rendering',
      })
    );
  });

  it('uses cached renders immediately and supports clearing preview state', async () => {
    const renderService = {
      init: jest.fn(async () => undefined),
      getCached: jest.fn(async () => ({
        output: new Uint8Array([7]),
        kind: 'svg',
        diagnostics: [{ severity: 'warning', message: 'cached' }],
      })),
      render: jest.fn(),
    };

    const hook = createHarness({
      suppressInitialRender: true,
      testOverrides: {
        renderService: renderService as never,
      },
    });

    await waitFor(() => {
      expect(hook.current().ready).toBe(true);
    });

    await act(async () => {
      await hook.current().manualRender();
    });

    expect(renderService.render).not.toHaveBeenCalled();
    expect(hook.current().previewSrc).toBe('blob:preview');
    expect(hook.current().previewKind).toBe('svg');
    expect(hook.current().diagnostics).toEqual([{ severity: 'warning', message: 'cached' }]);

    act(() => {
      hook.current().clearPreview();
    });

    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:preview');
    expect(hook.current().previewSrc).toBe('');
    expect(hook.current().diagnostics).toEqual([]);
    expect(hook.current().error).toBe('');
  });

  it('resolves working-directory dependencies and auto-switches to 2d when the initial 3d render is empty', async () => {
    const analytics = { track: jest.fn(), trackError: jest.fn(), setAnalyticsEnabled: jest.fn() };
    const renderService = {
      init: jest.fn(async () => undefined),
      getCached: jest.fn(async () => null),
      render: jest
        .fn()
        .mockResolvedValueOnce({
          output: new Uint8Array(),
          kind: 'mesh',
          diagnostics: [],
        })
        .mockResolvedValueOnce({
          output: new Uint8Array([5]),
          kind: 'svg',
          diagnostics: [],
        }),
    };
    const platform = {
      getLibraryPaths: jest.fn(async () => ['/lib/system']),
      readDirectoryFiles: jest
        .fn()
        .mockResolvedValueOnce({ 'system.scad': 'module helper() {}' })
        .mockResolvedValueOnce({ 'custom.scad': 'module custom() {}' }),
    };
    const resolveDeps = jest.fn(async () => ({ 'deps/shape.scad': 'square(10);' }));

    const hook = createHarness({
      suppressInitialRender: true,
      workingDir: '/project',
      library: {
        autoDiscoverSystem: true,
        customPaths: ['/lib/custom'],
      },
      testOverrides: {
        analytics,
        renderService: renderService as never,
        getPlatform: () => platform as never,
        resolveWorkingDirDeps: resolveDeps as never,
      },
    });

    await waitFor(() => {
      expect(hook.current().ready).toBe(true);
    });

    await act(async () => {
      await hook.current().manualRender();
    });

    expect(platform.readDirectoryFiles).toHaveBeenNthCalledWith(1, '/lib/system');
    expect(platform.readDirectoryFiles).toHaveBeenNthCalledWith(2, '/lib/custom');
    expect(resolveDeps).toHaveBeenCalledWith(
      '// Type your OpenSCAD code here\ncube([10, 10, 10]);',
      expect.objectContaining({
        workingDir: '/project',
        libraryFiles: {
          'custom.scad': 'module custom() {}',
          'system.scad': 'module helper() {}',
        },
      })
    );
    expect(renderService.render).toHaveBeenNthCalledWith(
      1,
      expect.any(String),
      expect.objectContaining({
        view: '3d',
        auxiliaryFiles: {
          'custom.scad': 'module custom() {}',
          'system.scad': 'module helper() {}',
          'deps/shape.scad': 'square(10);',
        },
      })
    );
    expect(renderService.render).toHaveBeenNthCalledWith(
      2,
      expect.any(String),
      expect.objectContaining({ view: '2d' })
    );
    expect(hook.current().dimensionMode).toBe('2d');
    expect(hook.current().previewKind).toBe('svg');
    expect(hook.current().auxiliaryFiles).toEqual({
      'custom.scad': 'module custom() {}',
      'system.scad': 'module helper() {}',
      'deps/shape.scad': 'square(10);',
    });
    expect(analytics.track).toHaveBeenCalledWith(
      'render completed',
      expect.objectContaining({
        switched_dimension: true,
        resolved_dimension: '2d',
      })
    );
  });

  it('reports diagnostic render errors and supports debounced auto-render with updateSourceAndRender', async () => {
    jest.useFakeTimers();

    const notify = jest.fn();
    const renderService = {
      init: jest.fn(async () => undefined),
      getCached: jest.fn(async () => null),
      render: jest
        .fn()
        .mockResolvedValueOnce({
          output: new Uint8Array(),
          kind: 'mesh',
          diagnostics: [{ severity: 'error', message: 'ERROR: syntax issue' }],
        })
        .mockRejectedValueOnce(new Error('runtime failure'))
        .mockResolvedValueOnce({
          output: new Uint8Array([2]),
          kind: 'mesh',
          diagnostics: [],
        })
        .mockResolvedValueOnce({
          output: new Uint8Array([3]),
          kind: 'mesh',
          diagnostics: [],
        }),
    };

    const hook = createHarness({
      suppressInitialRender: true,
      autoRenderOnIdle: true,
      autoRenderDelayMs: 250,
      testOverrides: {
        renderService: renderService as never,
        notifyError: notify,
      },
    });

    await waitFor(() => {
      expect(hook.current().ready).toBe(true);
    });

    await act(async () => {
      await hook.current().manualRender();
    });
    expect(hook.current().error).toBe('ERROR: syntax issue');

    await act(async () => {
      await hook.current().renderOnSave();
    });
    expect(hook.current().error).toContain('runtime failure');
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: 'render-runtime',
      })
    );

    await act(async () => {
      await hook.current().updateSourceAndRender('cube(42);', 'code_update');
    });
    expect(renderService.render).toHaveBeenLastCalledWith(
      'cube(42);',
      expect.objectContaining({ view: '3d' })
    );

    act(() => {
      hook.current().updateSource('cube(99);');
      jest.advanceTimersByTime(250);
    });

    await waitFor(() => {
      expect(renderService.render).toHaveBeenCalledWith(
        'cube(99);',
        expect.objectContaining({ view: '3d' })
      );
    });

    jest.useRealTimers();
  });
});
