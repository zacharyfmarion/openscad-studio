/// <reference lib="webworker" />

import { createOpenScadInstanceWithBundledFonts } from './openscad-wasm-fonts';

declare const self: DedicatedWorkerGlobalScope;

// ============================================================================
// Message types
// ============================================================================

export interface WorkerRenderRequest {
  type: 'render';
  id: string;
  code: string;
  args: string[];
  auxiliaryFiles?: Record<string, string>;
  /** Project-relative path of the render target (e.g. "examples/keebcu/foo.scad").
   *  When provided with auxiliaryFiles, the input file is written at this path
   *  inside /input_dir/ so that sibling includes resolve correctly. */
  inputPath?: string;
}

export interface WorkerInitRequest {
  type: 'init';
}

export type WorkerRequest = WorkerRenderRequest | WorkerInitRequest;

export interface WorkerRenderResult {
  type: 'result';
  id: string;
  output: Uint8Array;
  stderr: string;
  exitCode: number;
}

export interface WorkerErrorResult {
  type: 'error';
  id: string;
  error: string;
}

export interface WorkerReadyResult {
  type: 'ready';
}

export type WorkerResponse = WorkerRenderResult | WorkerErrorResult | WorkerReadyResult;

// ============================================================================
// Helpers
// ============================================================================

function getOutputPath(args: string[]): string | null {
  const idx = args.indexOf('-o');
  if (idx !== -1 && idx + 1 < args.length) {
    return args[idx + 1];
  }
  return null;
}

// ============================================================================
// Render handler
// ============================================================================

/**
 * Each render creates a fresh WASM instance because Emscripten's callMain()
 * calls exit() which sets ABORT=true, making the instance unusable for
 * subsequent calls. The browser's WebAssembly compilation cache ensures
 * that re-instantiation is fast (~50-100ms) after the first compile.
 */
function ensureParentDirs(fs: { mkdir(path: string): void }, filePath: string): void {
  const parts = filePath.split('/').filter(Boolean);
  for (let i = 1; i < parts.length; i++) {
    const dir = '/' + parts.slice(0, i).join('/');
    try {
      fs.mkdir(dir);
    } catch {
      // Directory already exists
    }
  }
}

async function handleRender(request: WorkerRenderRequest): Promise<void> {
  const { id, code, args, auxiliaryFiles, inputPath: renderTargetPath } = request;

  try {
    const stderrLines: string[] = [];

    const instance = await createOpenScadInstanceWithBundledFonts({
      noInitialRun: true,
      print: () => {},
      printErr: (text: string) => {
        stderrLines.push(text);
      },
    });

    const wasm = instance.getInstance();

    // Write auxiliary files (e.g. included/used .scad files from working directory)
    if (auxiliaryFiles) {
      for (const [relativePath, content] of Object.entries(auxiliaryFiles)) {
        const fullPath = '/input_dir/' + relativePath;
        ensureParentDirs(wasm.FS, fullPath);
        wasm.FS.writeFile(fullPath, content);
      }
    }

    // Write input file at its project-relative path so sibling includes resolve.
    // e.g. "examples/keebcu/foo.scad" → "/input_dir/examples/keebcu/foo.scad"
    const inputPath = auxiliaryFiles
      ? '/input_dir/' + (renderTargetPath || 'input.scad')
      : '/input.scad';
    ensureParentDirs(wasm.FS, inputPath);
    wasm.FS.writeFile(inputPath, code);

    // Rewrite input path in args to match where we wrote the file
    const finalArgs = args.map((a) => (a === '/input.scad' ? inputPath : a));

    // Determine output path
    const outputPath = getOutputPath(finalArgs);

    // Run OpenSCAD
    let exitCode: number;
    try {
      exitCode = wasm.callMain(finalArgs);
    } catch (e) {
      // callMain throws ExitStatus on exit() — extract the exit code
      if (e && typeof e === 'object' && 'status' in e) {
        exitCode = (e as { status: number }).status;
      } else {
        const response: WorkerErrorResult = {
          type: 'error',
          id,
          error: `OpenSCAD crashed: ${e}`,
        };
        self.postMessage(response);
        return;
      }
    }

    // Read output file if it exists
    let output = new Uint8Array(0);
    if (outputPath) {
      try {
        output = wasm.FS.readFile(outputPath, { encoding: 'binary' });
      } catch {
        // Output file may not have been created (compilation error)
      }
    }

    const stderr = stderrLines.join('\n');

    // No need to cleanup files — the entire WASM instance is discarded

    const response: WorkerRenderResult = {
      type: 'result',
      id,
      output,
      stderr,
      exitCode,
    };
    self.postMessage(response, [output.buffer]);
  } catch (e) {
    const response: WorkerErrorResult = {
      type: 'error',
      id,
      error: `Worker error: ${e}`,
    };
    self.postMessage(response);
  }
}

// ============================================================================
// Message handler
// ============================================================================

self.addEventListener('message', async (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;

  switch (request.type) {
    case 'init': {
      try {
        // Warm up: create one instance to trigger WASM compilation + caching
        // and verify bundled font assets are available before reporting ready.
        // The instance is discarded; subsequent createOpenSCAD calls will
        // reuse the browser's compiled module cache.
        await createOpenScadInstanceWithBundledFonts({
          noInitialRun: true,
          print: () => {},
          printErr: () => {},
        });
        const response: WorkerReadyResult = { type: 'ready' };
        self.postMessage(response);
      } catch (e) {
        const response: WorkerErrorResult = {
          type: 'error',
          id: '__init__',
          error: `Failed to initialize OpenSCAD WASM: ${e}`,
        };
        self.postMessage(response);
      }
      break;
    }
    case 'render': {
      await handleRender(request);
      break;
    }
  }
});
