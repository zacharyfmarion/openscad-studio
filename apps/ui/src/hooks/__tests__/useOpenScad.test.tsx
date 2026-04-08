/** @jest-environment jsdom */

import { act, render, waitFor } from '@testing-library/react';
import { jest } from '@jest/globals';
import { useOpenScad } from '../useOpenScad';
import { getProjectStore } from '../../stores/projectStore';

type MockRenderResult = {
  output: Uint8Array;
  kind: 'mesh' | 'svg';
  diagnostics: Array<{ severity: 'error' | 'warning' | 'info'; message: string }>;
};

function createHarness(options?: Parameters<typeof useOpenScad>[0]) {
  let latest: ReturnType<typeof useOpenScad>;
  let currentOptions = options;

  function Harness({ hookOptions }: { hookOptions?: Parameters<typeof useOpenScad>[0] }) {
    latest = useOpenScad(hookOptions);
    return null;
  }

  const view = render(<Harness hookOptions={currentOptions} />);

  return {
    current() {
      return latest!;
    },
    rerender(nextOptions?: Parameters<typeof useOpenScad>[0]) {
      currentOptions = nextOptions;
      view.rerender(<Harness hookOptions={currentOptions} />);
    },
  };
}

describe('useOpenScad', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    globalThis.URL.createObjectURL = jest.fn(() => 'blob:preview');
    globalThis.URL.revokeObjectURL = jest.fn();
    window.__PLAYWRIGHT__ = false;
    getProjectStore().getState().resetProject();
  });

  it('initializes the render service and performs the initial render by default', async () => {
    const analytics = { track: jest.fn(), trackError: jest.fn(), setAnalyticsEnabled: jest.fn() };
    const renderService = {
      init: jest.fn(async () => undefined),
      getCached: jest.fn(async () => null),
      render: jest.fn(
        async (): Promise<MockRenderResult> => ({
          output: new Uint8Array([1]),
          kind: 'mesh',
          diagnostics: [],
        })
      ),
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
      expect(hook.current().error).toContain('Failed to initialize OpenSCAD');
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
        libraryFiles: {
          'custom.scad': 'module custom() {}',
          'system.scad': 'module helper() {}',
        },
        libraryPaths: ['/lib/system', '/lib/custom'],
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

  it('reports diagnostic render errors and supports renderCode for immediate renders', async () => {
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
        }),
    };

    const hook = createHarness({
      suppressInitialRender: true,
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
      await hook.current().renderCode('cube(42);', 'code_update');
    });
    expect(renderService.render).toHaveBeenLastCalledWith(
      'cube(42);',
      expect.objectContaining({ view: '3d' })
    );
  });

  it('re-resolves project dependencies before cache lookup for manual renders', async () => {
    const projectStore = getProjectStore();
    projectStore.getState().openProject(
      null,
      {
        'main.scad': 'include <dep.scad>\ncube(size);',
        'dep.scad': 'size = 10;',
      },
      'main.scad'
    );

    const renderService = {
      init: jest.fn(async () => undefined),
      getCached: jest.fn(async (_code, options) => {
        if (options?.auxiliaryFiles?.['dep.scad'] === 'size = 10;') {
          return {
            output: new Uint8Array([7]),
            kind: 'mesh' as const,
            diagnostics: [{ severity: 'warning' as const, message: 'cached-10' }],
          };
        }

        return null;
      }),
      render: jest.fn(async () => ({
        output: new Uint8Array([9]),
        kind: 'mesh' as const,
        diagnostics: [],
      })),
    };

    const hook = createHarness({
      suppressInitialRender: true,
      source: projectStore.getState().files['main.scad']?.content ?? '',
      contentVersion: projectStore.getState().contentVersion,
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
    expect(hook.current().diagnostics).toEqual([{ severity: 'warning', message: 'cached-10' }]);

    projectStore.getState().updateFileContent('dep.scad', 'size = 20;');
    hook.rerender({
      suppressInitialRender: true,
      source: projectStore.getState().files['main.scad']?.content ?? '',
      contentVersion: projectStore.getState().contentVersion,
      testOverrides: {
        renderService: renderService as never,
      },
    });

    await act(async () => {
      await hook.current().manualRender();
    });

    expect(renderService.getCached).toHaveBeenLastCalledWith(
      'include <dep.scad>\ncube(size);',
      expect.objectContaining({
        auxiliaryFiles: {
          'dep.scad': 'size = 20;',
        },
      })
    );
    expect(renderService.render).toHaveBeenCalledTimes(1);
    expect(hook.current().diagnostics).toEqual([]);
  });
});
