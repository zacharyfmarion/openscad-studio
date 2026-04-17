/**
 * Native OpenSCAD render service for desktop (Tauri).
 *
 * Routes render requests through Tauri IPC to a native OpenSCAD binary
 * instead of the WASM Web Worker. The native binary has full filesystem
 * access, system fonts, and runs faster.
 */

import { invoke } from '@tauri-apps/api/core';
import {
  type IRenderService,
  type RenderOptions,
  type RenderResult,
  type ExportFormat,
  type SyntaxCheckResult,
  type Diagnostic,
  RenderCache,
  generateRenderCacheKey,
  hasOnlyTopLevelDimensionMismatchErrors,
  parseOpenScadStderr,
} from './renderService';
import { createExportValidationError } from './exportErrors';

// ============================================================================
// Tauri IPC types (must match Rust structs)
// ============================================================================

interface RenderNativeResult {
  output: number[]; // Vec<u8> serialized as JSON array
  stderr: string;
  exit_code: number;
  duration_ms: number;
}

// ============================================================================
// NativeRenderService
// ============================================================================

export class NativeRenderService implements IRenderService {
  private cache = new RenderCache();
  private initPromise: Promise<void> | null = null;
  private disposed = false;
  private version: string | null = null;

  /**
   * Initialize: discover the OpenSCAD binary and verify it works.
   */
  async init(): Promise<void> {
    if (this.disposed) {
      throw new Error('NativeRenderService has been disposed');
    }

    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      try {
        const version = await invoke<string>('render_init');
        this.version = version;
        console.info(`[NativeRenderService] OpenSCAD initialized: ${version}`);
      } catch (e) {
        this.initPromise = null;
        throw new Error(`Failed to initialize native OpenSCAD: ${e}`);
      }
    })();

    return this.initPromise;
  }

  /**
   * Get the cached OpenSCAD version string (available after init).
   */
  getVersion(): string | null {
    return this.version;
  }

  /**
   * Check if a render result is already cached.
   */
  async getCached(code: string, options: RenderOptions = {}): Promise<RenderResult | null> {
    const cacheKey = await generateRenderCacheKey(code, options);
    const cached = this.cache.get(cacheKey);
    if (cached) {
      return {
        output: cached.output,
        kind: cached.kind,
        diagnostics: cached.diagnostics,
      };
    }
    return null;
  }

  /**
   * Render OpenSCAD code using the native binary.
   */
  async render(code: string, options: RenderOptions = {}): Promise<RenderResult> {
    const {
      view = '3d',
      backend = 'manifold',
      auxiliaryFiles,
      inputPath,
      workingDir,
      libraryPaths,
    } = options;

    // Check cache
    const cacheKey = await generateRenderCacheKey(code, options);
    const cached = this.cache.get(cacheKey);
    if (cached) {
      return {
        output: cached.output,
        kind: cached.kind,
        diagnostics: cached.diagnostics,
      };
    }

    await this.init();

    // Build CLI args (same format as WasmRenderService)
    const is3d = view === '3d';
    const outputPath = is3d ? '/output.off' : '/output.svg';
    const kind: 'mesh' | 'svg' = is3d ? 'mesh' : 'svg';

    const args = ['/input.scad', '-o', outputPath];
    if (backend === 'manifold') args.push('--backend=manifold');
    else if (backend === 'cgal') args.push('--backend=cgal');

    const result = await this.invokeRender(
      code,
      args,
      auxiliaryFiles,
      inputPath,
      workingDir,
      libraryPaths
    );
    const diagnostics = parseOpenScadStderr(result.stderr);

    const output = new Uint8Array(result.output);

    // Cache the result
    this.cache.set(cacheKey, {
      output,
      kind,
      diagnostics,
      timestamp: Date.now(),
    });

    return { output, kind, diagnostics };
  }

  /**
   * Export a model in a specific format.
   */
  async exportModel(
    code: string,
    format: ExportFormat,
    options: {
      backend?: 'manifold' | 'cgal' | 'auto';
      auxiliaryFiles?: Record<string, string>;
      inputPath?: string;
      workingDir?: string;
      libraryFiles?: Record<string, string>;
      libraryPaths?: string[];
    } = {}
  ): Promise<Uint8Array> {
    const { backend = 'manifold' } = options;

    await this.init();

    const outputPath = `/output.${format}`;
    const args = ['/input.scad', '-o', outputPath];

    if (backend === 'manifold') args.push('--backend=manifold');
    else if (backend === 'cgal') args.push('--backend=cgal');

    if (format === 'stl') {
      args.push('--export-format=binstl');
    }

    const allFiles =
      options.libraryFiles || options.auxiliaryFiles
        ? { ...(options.libraryFiles || {}), ...(options.auxiliaryFiles || {}) }
        : undefined;

    const result = await this.invokeRender(
      code,
      args,
      allFiles,
      options.inputPath,
      options.workingDir,
      options.libraryPaths
    );
    const output = new Uint8Array(result.output);

    if (output.length === 0) {
      const diagnostics = parseOpenScadStderr(result.stderr);
      const errors = diagnostics.filter((d: Diagnostic) => d.severity === 'error');
      if (errors.length > 0) {
        throw createExportValidationError(errors.map((e: Diagnostic) => e.message));
      }
      throw new Error('Export produced no output');
    }

    return output;
  }

  /**
   * Check syntax by rendering (same as WASM approach).
   */
  async checkSyntax(code: string, options: RenderOptions = {}): Promise<SyntaxCheckResult> {
    await this.init();

    const preferredView = options.view ?? '3d';
    const allFiles =
      options.libraryFiles || options.auxiliaryFiles
        ? { ...(options.libraryFiles || {}), ...(options.auxiliaryFiles || {}) }
        : undefined;

    const runSyntaxCheck = async (view: '2d' | '3d') => {
      const outputPath = view === '3d' ? '/output.stl' : '/output.svg';
      const args = ['/input.scad', '-o', outputPath, '--backend=manifold'];
      const result = await this.invokeRender(
        code,
        args,
        allFiles,
        options.inputPath,
        options.workingDir,
        options.libraryPaths
      );
      return parseOpenScadStderr(result.stderr);
    };

    const diagnostics = await runSyntaxCheck(preferredView);
    if (!hasOnlyTopLevelDimensionMismatchErrors(diagnostics)) {
      return { diagnostics };
    }

    const fallbackView = preferredView === '3d' ? '2d' : '3d';
    return { diagnostics: await runSyntaxCheck(fallbackView) };
  }

  /**
   * Cancel running render.
   */
  cancel(): void {
    invoke('render_cancel').catch(() => {
      // Best-effort cancellation
    });
  }

  clearCache(): void {
    this.cache.clear();
  }

  dispose(): void {
    this.disposed = true;
    this.cancel();
  }

  // --------------------------------------------------------------------------
  // Private
  // --------------------------------------------------------------------------

  private async invokeRender(
    code: string,
    args: string[],
    auxiliaryFiles?: Record<string, string>,
    inputPath?: string,
    workingDir?: string,
    libraryPaths?: string[]
  ): Promise<RenderNativeResult> {
    if (this.disposed) {
      throw new Error('NativeRenderService has been disposed');
    }

    const result = await invoke<RenderNativeResult>('render_native', {
      code,
      args,
      auxiliaryFiles:
        auxiliaryFiles && Object.keys(auxiliaryFiles).length > 0 ? auxiliaryFiles : null,
      inputPath: inputPath ?? null,
      workingDir: workingDir ?? null,
      libraryPaths: libraryPaths && libraryPaths.length > 0 ? libraryPaths : null,
    });

    return result;
  }
}
