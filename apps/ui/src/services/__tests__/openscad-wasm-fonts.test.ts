import { jest } from '@jest/globals';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createOpenSCAD, type OpenSCAD } from 'openscad-wasm';
import {
  createOpenScadInstanceWithBundledFonts,
  resetBundledOpenScadFontsForTesting,
} from '../openscad-wasm-fonts';

function localAssetFetch(input: string | URL): Promise<Response> {
  const url = input instanceof URL ? input : new URL(input);
  return readFile(fileURLToPath(url)).then((bytes) => new Response(bytes));
}

function runCallMain(wasm: OpenSCAD, args: string[]): number {
  try {
    return wasm.callMain(args);
  } catch (error) {
    if (error && typeof error === 'object' && 'status' in error) {
      return (error as { status: number }).status;
    }
    throw error;
  }
}

describe('openscad-wasm bundled fonts', () => {
  afterEach(() => {
    resetBundledOpenScadFontsForTesting();
    jest.restoreAllMocks();
  });

  it('loads bundled font assets before creating a WASM instance', async () => {
    let releaseFetches: (() => void) | null = null;
    const fetchGate = new Promise<void>((resolve) => {
      releaseFetches = resolve;
    });

    const fetchMock = jest.fn(async (input: string | URL) => {
      await fetchGate;
      return localAssetFetch(input);
    });

    const writeFile = jest.fn();
    const createOpenSCADImpl = jest.fn(async () => ({
      getInstance: () =>
        ({
          FS: {
            mkdir: jest.fn(),
            stat: jest.fn(() => ({})),
            writeFile,
          },
        }) as OpenSCAD,
    }));

    const pendingInstance = createOpenScadInstanceWithBundledFonts(
      { noInitialRun: true },
      {
        createOpenSCADImpl: createOpenSCADImpl as typeof createOpenSCAD,
        fetchImpl: fetchMock as unknown as typeof fetch,
      }
    );

    await Promise.resolve();
    expect(createOpenSCADImpl).not.toHaveBeenCalled();

    releaseFetches?.();
    await pendingInstance;

    expect(fetchMock).toHaveBeenCalled();
    expect(createOpenSCADImpl).toHaveBeenCalledTimes(1);
    expect(writeFile).toHaveBeenCalledWith('/fonts/fonts.conf', expect.any(Uint8Array));
    expect(writeFile).toHaveBeenCalledWith('/fonts/NotoSans-Regular.ttf', expect.any(Uint8Array));
    expect(writeFile).toHaveBeenCalledWith(
      '/fonts/NotoSansMono-Regular.ttf',
      expect.any(Uint8Array)
    );
    expect(writeFile).toHaveBeenCalledWith('/fonts/NotoSerif-Regular.ttf', expect.any(Uint8Array));
  });

  it('renders 2d text output with the bundled web fonts', async () => {
    const stderrLines: string[] = [];
    const instance = await createOpenScadInstanceWithBundledFonts(
      {
        noInitialRun: true,
        print: () => {},
        printErr: (text) => {
          stderrLines.push(text);
        },
      },
      { fetchImpl: localAssetFetch as unknown as typeof fetch }
    );

    const wasm = instance.getInstance();
    wasm.FS.writeFile('/input.scad', 'text("A", size = 14, font = "Bitstream Vera Sans");');

    const exitCode = runCallMain(wasm, ['/input.scad', '-o', '/output.svg']);
    const output = wasm.FS.readFile('/output.svg', { encoding: 'utf8' });

    expect(exitCode).toBe(0);
    expect(output).toContain('<svg');
    expect(output.length).toBeGreaterThan(200);
    expect(stderrLines.join('\n')).not.toMatch(/ERROR:/i);
  });

  it('renders 3d extruded text output with the bundled web fonts', async () => {
    const stderrLines: string[] = [];
    const instance = await createOpenScadInstanceWithBundledFonts(
      {
        noInitialRun: true,
        print: () => {},
        printErr: (text) => {
          stderrLines.push(text);
        },
      },
      { fetchImpl: localAssetFetch as unknown as typeof fetch }
    );

    const wasm = instance.getInstance();
    wasm.FS.writeFile(
      '/input.scad',
      'linear_extrude(height = 2) text("A", size = 14, font = "Arial");'
    );

    const exitCode = runCallMain(wasm, ['/input.scad', '-o', '/output.off', '--backend=manifold']);
    const output = wasm.FS.readFile('/output.off', { encoding: 'binary' });

    expect(exitCode).toBe(0);
    expect(output.length).toBeGreaterThan(0);
    expect(stderrLines.join('\n')).not.toMatch(/ERROR:/i);
  });
});
