/** @jest-environment jsdom */

import { jest } from '@jest/globals';
import { webcrypto } from 'node:crypto';
import { TextDecoder, TextEncoder } from 'node:util';
import {
  RenderService,
  parseOpenScadStderr,
  type ExportFormat,
  type RenderResult,
} from '../renderService';
import { isExportValidationError } from '../exportErrors';

type WorkerListener = (event: { data?: unknown; message?: string; error?: unknown }) => void;

class MockWorker {
  listeners: Record<'message' | 'error', WorkerListener[]> = {
    message: [],
    error: [],
  };
  postedMessages: unknown[] = [];
  terminated = false;

  addEventListener(type: 'message' | 'error', listener: WorkerListener) {
    this.listeners[type].push(listener);
  }

  removeEventListener(type: 'message' | 'error', listener: WorkerListener) {
    this.listeners[type] = this.listeners[type].filter((entry) => entry !== listener);
  }

  postMessage(message: unknown) {
    this.postedMessages.push(message);
  }

  emitMessage(data: unknown) {
    for (const listener of this.listeners.message) {
      listener({ data });
    }
  }

  emitError(message: string, error?: unknown) {
    for (const listener of this.listeners.error) {
      listener({ message, error });
    }
  }

  terminate() {
    this.terminated = true;
  }
}

const workerFactory = jest.fn<() => MockWorker>();
const mockWorkers: MockWorker[] = [];

function isRenderRequest(message: unknown): message is {
  id: string;
  args: string[];
  type: 'render';
  code: string;
} {
  return (
    typeof message === 'object' &&
    message !== null &&
    'type' in message &&
    message.type === 'render'
  );
}

async function takeLastPostedRenderRequest() {
  const worker = mockWorkers.at(-1);
  expect(worker).toBeDefined();

  let request = [...worker!.postedMessages].reverse().find(isRenderRequest);
  for (let attempt = 0; !request && attempt < 5; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
    request = [...worker!.postedMessages].reverse().find(isRenderRequest);
  }

  expect(request).toBeDefined();
  return { worker: worker!, request: request! };
}

async function waitForRenderRequestCount(expectedCount: number) {
  const worker = mockWorkers.at(-1);
  expect(worker).toBeDefined();

  let requests = worker!.postedMessages.filter(isRenderRequest);
  for (let attempt = 0; requests.length < expectedCount && attempt < 5; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
    requests = worker!.postedMessages.filter(isRenderRequest);
  }

  expect(requests).toHaveLength(expectedCount);
  return { worker: worker!, request: requests.at(-1)! };
}

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
  Object.defineProperty(globalThis, 'Worker', {
    configurable: true,
    writable: true,
    value: workerFactory.mockImplementation(() => {
      const worker = new MockWorker();
      mockWorkers.push(worker);
      return worker as never;
    }),
  });
});

describe('parseOpenScadStderr', () => {
  it('parses explicit severities and implicit errors with line numbers', () => {
    expect(
      parseOpenScadStderr(
        [
          'ERROR: Parser error in file foo.scad, line 12',
          'WARNING: deprecated call on line 7',
          'ECHO: "debug"',
          'Current top level object is not a 3D object.',
        ].join('\n')
      )
    ).toEqual([
      {
        severity: 'error',
        line: 12,
        col: undefined,
        message: 'ERROR: Parser error in file foo.scad, line 12',
      },
      {
        severity: 'warning',
        line: 7,
        col: undefined,
        message: 'WARNING: deprecated call on line 7',
      },
      {
        severity: 'info',
        line: undefined,
        col: undefined,
        message: 'ECHO: "debug"',
      },
      {
        severity: 'error',
        line: undefined,
        col: undefined,
        message: 'Current top level object is not a 3D object.',
      },
    ]);
  });
});

describe('RenderService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockWorkers.length = 0;
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('initializes the worker once and reuses cached render results', async () => {
    const service = new RenderService();

    const initPromise = service.init();
    expect(workerFactory).toHaveBeenCalledTimes(1);
    expect(mockWorkers[0].postedMessages[0]).toEqual({ type: 'init' });
    mockWorkers[0].emitMessage({ type: 'ready' });
    await initPromise;

    const renderPromise = service.render('cube(10);', { view: '3d' });
    const { worker, request } = await takeLastPostedRenderRequest();
    expect(request.args).toEqual(['/input.scad', '-o', '/output.off', '--backend=manifold']);
    worker.emitMessage({
      type: 'result',
      id: request.id,
      output: new Uint8Array([1, 2, 3]),
      stderr: 'WARNING: preview note',
    });

    const firstResult = await renderPromise;
    expect(firstResult).toEqual<RenderResult>({
      output: new Uint8Array([1, 2, 3]),
      kind: 'mesh',
      diagnostics: [
        {
          severity: 'warning',
          line: undefined,
          col: undefined,
          message: 'WARNING: preview note',
        },
      ],
    });

    const cachedResult = await service.render('cube(10);', { view: '3d' });
    expect(cachedResult).toEqual(firstResult);
    expect(worker.postedMessages).toHaveLength(2);
  });

  it('builds view/backend-specific args and returns cached results through getCached', async () => {
    const service = new RenderService();
    const initPromise = service.init();
    mockWorkers[0].emitMessage({ type: 'ready' });
    await initPromise;

    const renderPromise = service.render('square(10);', { view: '2d', backend: 'auto' });
    const { worker, request } = await takeLastPostedRenderRequest();
    expect(request.args).toEqual(['/input.scad', '-o', '/output.svg']);
    worker.emitMessage({
      type: 'result',
      id: request.id,
      output: new Uint8Array([9]),
      stderr: '',
    });
    await renderPromise;

    await expect(
      service.getCached('square(10);', { view: '2d', backend: 'auto' })
    ).resolves.toEqual({
      output: new Uint8Array([9]),
      kind: 'svg',
      diagnostics: [],
    });
  });

  it('invalidates cached renders when an auxiliary file changes but the file count stays the same', async () => {
    const service = new RenderService();
    const initPromise = service.init();
    mockWorkers[0].emitMessage({ type: 'ready' });
    await initPromise;

    const firstRender = service.render('include <dep.scad>\ncube(size);', {
      view: '3d',
      auxiliaryFiles: {
        'dep.scad': 'size = 10;',
      },
    });
    const firstPosted = await takeLastPostedRenderRequest();
    firstPosted.worker.emitMessage({
      type: 'result',
      id: firstPosted.request.id,
      output: new Uint8Array([1]),
      stderr: '',
    });
    await firstRender;

    const secondRender = service.render('include <dep.scad>\ncube(size);', {
      view: '3d',
      auxiliaryFiles: {
        'dep.scad': 'size = 20;',
      },
    });
    const secondPosted = await waitForRenderRequestCount(2);
    secondPosted.worker.emitMessage({
      type: 'result',
      id: secondPosted.request.id,
      output: new Uint8Array([2]),
      stderr: '',
    });

    await expect(secondRender).resolves.toEqual<RenderResult>({
      output: new Uint8Array([2]),
      kind: 'mesh',
      diagnostics: [],
    });
  });

  it('invalidates cached renders when the render target path changes', async () => {
    const service = new RenderService();
    const initPromise = service.init();
    mockWorkers[0].emitMessage({ type: 'ready' });
    await initPromise;

    const firstRender = service.render('include <dep.scad>\ncube(size);', {
      view: '3d',
      inputPath: 'variants/a/main.scad',
      auxiliaryFiles: {
        'variants/a/dep.scad': 'size = 10;',
      },
    });
    const posted = await takeLastPostedRenderRequest();
    posted.worker.emitMessage({
      type: 'result',
      id: posted.request.id,
      output: new Uint8Array([3]),
      stderr: '',
    });
    await firstRender;

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

  it('converts export validation failures into ExportValidationError and supports binary STL export', async () => {
    const service = new RenderService();
    const initPromise = service.init();
    mockWorkers[0].emitMessage({ type: 'ready' });
    await initPromise;

    const exportPromise = service.exportModel('cube(10);', 'stl');
    const { worker, request } = await takeLastPostedRenderRequest();
    expect(request.args).toEqual([
      '/input.scad',
      '-o',
      '/output.stl',
      '--backend=manifold',
      '--export-format=binstl',
    ]);
    worker.emitMessage({
      type: 'result',
      id: request.id,
      output: new Uint8Array(),
      stderr: 'ERROR: Export failed on line 4',
    });

    try {
      await exportPromise;
      throw new Error('Expected export to fail');
    } catch (error) {
      expect(isExportValidationError(error)).toBe(true);
    }
  });

  it('throws a generic error when export produces no output without diagnostics', async () => {
    const service = new RenderService();
    const initPromise = service.init();
    mockWorkers[0].emitMessage({ type: 'ready' });
    await initPromise;

    const exportPromise = service.exportModel('cube(10);', 'obj' as ExportFormat);
    const { worker, request } = await takeLastPostedRenderRequest();
    worker.emitMessage({
      type: 'result',
      id: request.id,
      output: new Uint8Array(),
      stderr: '',
    });

    await expect(exportPromise).rejects.toThrow('Export produced no output');
  });

  it('forwards export auxiliary files and input path to the worker', async () => {
    const service = new RenderService();
    const initPromise = service.init();
    mockWorkers[0].emitMessage({ type: 'ready' });
    await initPromise;

    const exportPromise = service.exportModel('use <shared.scad>;\ncube(10);', 'obj', {
      auxiliaryFiles: { 'shared.scad': 'module helper() {}' },
      libraryFiles: { 'libraries/util.scad': 'module util() {}' },
      inputPath: 'models/main.scad',
    });
    const { worker, request } = await takeLastPostedRenderRequest();

    expect(request.args).toEqual(['/input.scad', '-o', '/output.obj', '--backend=manifold']);
    expect((request as { inputPath?: string }).inputPath).toBe('models/main.scad');
    expect((request as { auxiliaryFiles?: Record<string, string> }).auxiliaryFiles).toStrictEqual({
      'shared.scad': 'module helper() {}',
      'libraries/util.scad': 'module util() {}',
    });

    worker.emitMessage({
      type: 'result',
      id: request.id,
      output: new Uint8Array([1, 2, 3]),
      stderr: '',
    });

    await expect(exportPromise).resolves.toEqual(new Uint8Array([1, 2, 3]));
  });

  it('forwards syntax-check auxiliary files and input path to the worker', async () => {
    const service = new RenderService();
    const initPromise = service.init();
    mockWorkers[0].emitMessage({ type: 'ready' });
    await initPromise;

    const checkPromise = service.checkSyntax('use <shared.scad>;\ncube(10);', {
      auxiliaryFiles: { 'shared.scad': 'module helper() {}' },
      libraryFiles: { 'libraries/util.scad': 'module util() {}' },
      inputPath: 'models/main.scad',
    });
    const { worker, request } = await takeLastPostedRenderRequest();

    expect(request.args).toEqual(['/input.scad', '-o', '/output.stl', '--backend=manifold']);
    expect((request as { inputPath?: string }).inputPath).toBe('models/main.scad');
    expect((request as { auxiliaryFiles?: Record<string, string> }).auxiliaryFiles).toStrictEqual({
      'shared.scad': 'module helper() {}',
      'libraries/util.scad': 'module util() {}',
    });

    worker.emitMessage({
      type: 'result',
      id: request.id,
      output: new Uint8Array(),
      stderr: 'WARNING: include note',
    });

    await expect(checkPromise).resolves.toEqual({
      diagnostics: [
        {
          severity: 'warning',
          line: undefined,
          col: undefined,
          message: 'WARNING: include note',
        },
      ],
    });
  });

  it('retries syntax checks in 2D mode when the 3D pass only reports a top-level mismatch', async () => {
    const service = new RenderService();
    const initPromise = service.init();
    mockWorkers[0].emitMessage({ type: 'ready' });
    await initPromise;

    const checkPromise = service.checkSyntax('square(10);');
    const firstRequest = await waitForRenderRequestCount(1);

    expect(firstRequest.request.args).toEqual([
      '/input.scad',
      '-o',
      '/output.stl',
      '--backend=manifold',
    ]);

    firstRequest.worker.emitMessage({
      type: 'result',
      id: firstRequest.request.id,
      output: new Uint8Array(),
      stderr: 'Current top level object is not a 3D object.',
    });

    const secondRequest = await waitForRenderRequestCount(2);
    expect(secondRequest.request.args).toEqual([
      '/input.scad',
      '-o',
      '/output.svg',
      '--backend=manifold',
    ]);

    secondRequest.worker.emitMessage({
      type: 'result',
      id: secondRequest.request.id,
      output: new Uint8Array(),
      stderr: 'WARNING: 2D note',
    });

    await expect(checkPromise).resolves.toEqual({
      diagnostics: [
        {
          severity: 'warning',
          line: undefined,
          col: undefined,
          message: 'WARNING: 2D note',
        },
      ],
    });
  });

  it('rejects init when the worker reports an __init__ error', async () => {
    const service = new RenderService();
    const initPromise = service.init();

    mockWorkers[0].emitMessage({
      type: 'error',
      id: '__init__',
      error: 'wasm failed to load',
    });

    await expect(initPromise).rejects.toThrow('wasm failed to load');
  });

  it('rejects pending requests and reports worker crashes', async () => {
    const service = new RenderService();
    const initPromise = service.init();
    mockWorkers[0].emitMessage({ type: 'ready' });
    await initPromise;

    const renderPromise = service.render('cube(10);');
    const { worker } = await takeLastPostedRenderRequest();
    worker.emitError('boom', new Error('boom'));

    await expect(renderPromise).rejects.toThrow('Worker error: boom');
    expect(console.error).toHaveBeenCalled();
  });

  it('cancels pending renders, clears init state, and prevents disposed services from rendering', async () => {
    const service = new RenderService();
    const initPromise = service.init();
    mockWorkers[0].emitMessage({ type: 'ready' });
    await initPromise;

    const pendingRender = service.render('cube(10);');
    const { worker } = await takeLastPostedRenderRequest();
    service.cancel();

    expect(worker.terminated).toBe(true);
    await expect(pendingRender).rejects.toThrow('Render cancelled');

    const reinitPromise = service.init();
    expect(workerFactory).toHaveBeenCalledTimes(2);
    mockWorkers[1].emitMessage({ type: 'ready' });
    await reinitPromise;

    service.dispose();
    await expect(service.render('cube(5);')).rejects.toThrow('RenderService has been disposed');
  });
});
