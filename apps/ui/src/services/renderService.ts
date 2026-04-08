import type {
  WorkerRequest,
  WorkerResponse,
  WorkerRenderResult,
  WorkerErrorResult,
} from './openscad-worker';
import { createExportValidationError, isImplicitOpenScadError } from './exportErrors';
import { notifyError } from '../utils/notifications';

// ============================================================================
// Public types
// ============================================================================

export interface Diagnostic {
  severity: 'error' | 'warning' | 'info';
  line?: number;
  col?: number;
  message: string;
}

export type ExportFormat = 'stl' | 'obj' | 'amf' | '3mf' | 'svg' | 'dxf';

export interface RenderOptions {
  view?: '2d' | '3d';
  backend?: 'manifold' | 'cgal' | 'auto';
  /** Project and working-directory files to materialize for include/use resolution. */
  auxiliaryFiles?: Record<string, string>;
  /** Project-relative path of the render target (e.g. "examples/keebcu/foo.scad").
   *  Passed to the worker so the input file is written at the correct nested path. */
  inputPath?: string;
  /** Absolute path to the project root directory (desktop only).
   *  Passed to the native binary as a search path for import() resolution. */
  workingDir?: string;
  /** Library file contents for WASM virtual FS. Native renderer ignores this
   *  when libraryPaths is provided (uses -L flags instead). */
  libraryFiles?: Record<string, string>;
  /** Absolute paths to library directories for native OpenSCAD -L flag resolution.
   *  WASM renderer ignores this. */
  libraryPaths?: string[];
}

export interface RenderResult {
  output: Uint8Array;
  kind: 'mesh' | 'svg';
  diagnostics: Diagnostic[];
}

export interface SyntaxCheckResult {
  diagnostics: Diagnostic[];
}

function sortRecordEntries(record?: Record<string, string>): Array<[string, string]> {
  return Object.entries(record ?? {}).sort(([left], [right]) => left.localeCompare(right));
}

function sortStrings(values?: string[]): string[] {
  return [...(values ?? [])].sort((left, right) => left.localeCompare(right));
}

export async function generateRenderCacheKey(
  code: string,
  options: RenderOptions = {}
): Promise<string> {
  const {
    view = '3d',
    backend = 'manifold',
    auxiliaryFiles,
    inputPath,
    workingDir,
    libraryFiles,
    libraryPaths,
  } = options;

  const fingerprintPayload = JSON.stringify({
    code,
    view,
    backend,
    inputPath: inputPath ?? null,
    workingDir: workingDir ?? null,
    auxiliaryFiles: sortRecordEntries(auxiliaryFiles),
    libraryFiles: sortRecordEntries(libraryFiles),
    libraryPaths: sortStrings(libraryPaths),
  });

  const data = new TextEncoder().encode(fingerprintPayload);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = new Uint8Array(hashBuffer);
  return Array.from(hashArray)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// ============================================================================
// Diagnostic parser (port of Rust parser)
// ============================================================================

const ERROR_REGEX = /^(ERROR|WARNING|ECHO):\s*(.*)/i;
const LINE_NUMBER_REGEX = /line\s+(\d+)/i;

export function parseOpenScadStderr(stderr: string): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  for (const rawLine of stderr.split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;

    const match = ERROR_REGEX.exec(line);
    const severityStr = match?.[1].toLowerCase();
    let severity: Diagnostic['severity'];
    if (severityStr) {
      switch (severityStr) {
        case 'error':
          severity = 'error';
          break;
        case 'warning':
          severity = 'warning';
          break;
        case 'echo':
          severity = 'info';
          break;
        default:
          continue;
      }
    } else if (isImplicitOpenScadError(line)) {
      severity = 'error';
    } else {
      continue;
    }

    const message = match?.[2] || line;
    const lineMatch = LINE_NUMBER_REGEX.exec(message);
    const lineNumber = lineMatch ? parseInt(lineMatch[1], 10) : undefined;

    diagnostics.push({
      severity,
      line: lineNumber,
      col: undefined,
      message: line,
    });
  }

  return diagnostics;
}

// ============================================================================
// Cache
// ============================================================================

interface CacheEntry {
  output: Uint8Array;
  kind: 'mesh' | 'svg';
  diagnostics: Diagnostic[];
  timestamp: number;
}

const MAX_CACHE_ENTRIES = 50;

export class RenderCache {
  private entries = new Map<string, CacheEntry>();

  get(key: string): CacheEntry | undefined {
    return this.entries.get(key);
  }

  set(key: string, entry: CacheEntry): void {
    // LRU eviction: remove oldest if at capacity
    if (this.entries.size >= MAX_CACHE_ENTRIES) {
      let oldestKey: string | undefined;
      let oldestTime = Infinity;
      for (const [k, v] of this.entries) {
        if (v.timestamp < oldestTime) {
          oldestTime = v.timestamp;
          oldestKey = k;
        }
      }
      if (oldestKey) {
        this.entries.delete(oldestKey);
      }
    }
    this.entries.set(key, entry);
  }

  clear(): void {
    this.entries.clear();
  }
}

// ============================================================================
// IRenderService interface
// ============================================================================

export interface IRenderService {
  init(): Promise<void>;
  render(code: string, options?: RenderOptions): Promise<RenderResult>;
  getCached(code: string, options?: RenderOptions): Promise<RenderResult | null>;
  exportModel(
    code: string,
    format: ExportFormat,
    options?: { backend?: 'manifold' | 'cgal' | 'auto' }
  ): Promise<Uint8Array>;
  checkSyntax(code: string): Promise<SyntaxCheckResult>;
  cancel(): void;
  clearCache(): void;
  dispose(): void;
}

// ============================================================================
// WasmRenderService (Web Worker–based, used on web)
// ============================================================================

type PendingRequest = {
  resolve: (result: WorkerRenderResult) => void;
  reject: (error: Error) => void;
};

export class WasmRenderService implements IRenderService {
  private worker: Worker | null = null;
  private pending = new Map<string, PendingRequest>();
  private cache = new RenderCache();
  private idCounter = 0;
  private initPromise: Promise<void> | null = null;
  private disposed = false;

  private createWorker(): Worker {
    return new Worker(new URL('./openscad-worker.ts', import.meta.url), {
      type: 'module',
    });
  }

  private setupWorker(worker: Worker): void {
    worker.addEventListener('message', (event: MessageEvent<WorkerResponse>) => {
      const response = event.data;

      if (response.type === 'ready') {
        // Handled by init()
        return;
      }

      if (response.type === 'result' || response.type === 'error') {
        const pending = this.pending.get(response.id);
        if (!pending) return;

        this.pending.delete(response.id);

        if (response.type === 'error') {
          pending.reject(new Error(response.error));
        } else {
          pending.resolve(response);
        }
      }
    });

    worker.addEventListener('error', (event) => {
      notifyError({
        operation: 'render-worker',
        error: event.error ?? event.message,
        fallbackMessage: 'The OpenSCAD render worker crashed',
        toastId: 'render-runtime-error',
        logLabel: '[RenderService] Worker error',
      });
      // Reject all pending requests
      for (const [id, pending] of this.pending) {
        pending.reject(new Error(`Worker error: ${event.message}`));
        this.pending.delete(id);
      }
    });
  }

  /**
   * Initialize the WASM instance in the worker.
   * Call this early (e.g., on app startup) to warm up the instance.
   */
  async init(): Promise<void> {
    if (this.disposed) {
      throw new Error('RenderService has been disposed');
    }

    if (this.initPromise) return this.initPromise;

    this.initPromise = new Promise<void>((resolve, reject) => {
      this.worker = this.createWorker();
      this.setupWorker(this.worker);

      const onMessage = (event: MessageEvent<WorkerResponse>) => {
        if (event.data.type === 'ready') {
          this.worker?.removeEventListener('message', onMessage);
          resolve();
        } else if (
          event.data.type === 'error' &&
          (event.data as WorkerErrorResult).id === '__init__'
        ) {
          this.worker?.removeEventListener('message', onMessage);
          reject(new Error((event.data as WorkerErrorResult).error));
        }
      };

      this.worker.addEventListener('message', onMessage);

      const initRequest: WorkerRequest = { type: 'init' };
      this.worker.postMessage(initRequest);
    });

    return this.initPromise;
  }

  private nextId(): string {
    return `req_${++this.idCounter}_${Date.now()}`;
  }

  private async sendRequest(
    code: string,
    args: string[],
    auxiliaryFiles?: Record<string, string>,
    inputPath?: string
  ): Promise<WorkerRenderResult> {
    if (this.disposed) {
      throw new Error('RenderService has been disposed');
    }

    await this.init();

    if (!this.worker || this.disposed) {
      throw new Error('RenderService has been disposed');
    }

    const id = this.nextId();

    return new Promise<WorkerRenderResult>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });

      const request: WorkerRequest = {
        type: 'render',
        id,
        code,
        args,
        auxiliaryFiles,
        inputPath,
      };

      this.worker!.postMessage(request);
    });
  }

  private buildArgs(outputPath: string, options: RenderOptions = {}): string[] {
    const { backend = 'manifold' } = options;

    const args = ['/input.scad', '-o', outputPath];

    switch (backend) {
      case 'manifold':
        args.push('--backend=manifold');
        break;
      case 'cgal':
        args.push('--backend=cgal');
        break;
      case 'auto':
        // Let OpenSCAD choose
        break;
    }

    return args;
  }

  /**
   * Render OpenSCAD code and return the output bytes + diagnostics.
   * 3D mode returns OFF (kind: 'mesh'), 2D mode returns SVG (kind: 'svg').
   */
  /**
   * Check if a render result is already cached for the given parameters.
   * Returns the cached result if found, or null if not cached.
   */
  async getCached(code: string, options: RenderOptions = {}): Promise<RenderResult | null> {
    const { auxiliaryFiles, libraryFiles } = options;
    const allFiles =
      libraryFiles || auxiliaryFiles
        ? { ...(libraryFiles || {}), ...(auxiliaryFiles || {}) }
        : undefined;
    const cacheKey = await generateRenderCacheKey(code, {
      ...options,
      auxiliaryFiles: allFiles,
      libraryFiles,
    });
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

  async render(code: string, options: RenderOptions = {}): Promise<RenderResult> {
    const { view = '3d', backend = 'manifold', auxiliaryFiles, libraryFiles, inputPath } = options;

    // Merge library files into auxiliary files for WASM virtual FS
    const allFiles =
      libraryFiles || auxiliaryFiles
        ? { ...(libraryFiles || {}), ...(auxiliaryFiles || {}) }
        : undefined;

    // Check cache
    const cacheKey = await generateRenderCacheKey(code, {
      ...options,
      auxiliaryFiles: allFiles,
      libraryFiles,
    });
    const cached = this.cache.get(cacheKey);
    if (cached) {
      return {
        output: cached.output,
        kind: cached.kind,
        diagnostics: cached.diagnostics,
      };
    }

    // Determine output format
    const is3d = view === '3d';
    const outputPath = is3d ? '/output.off' : '/output.svg';
    const kind: 'mesh' | 'svg' = is3d ? 'mesh' : 'svg';

    const args = this.buildArgs(outputPath, { view, backend });
    const result = await this.sendRequest(code, args, allFiles, inputPath);

    const diagnostics = parseOpenScadStderr(result.stderr);

    // Cache the result
    this.cache.set(cacheKey, {
      output: result.output,
      kind,
      diagnostics,
      timestamp: Date.now(),
    });

    return {
      output: result.output,
      kind,
      diagnostics,
    };
  }

  /**
   * Check syntax by attempting to render. Returns diagnostics only.
   */
  async checkSyntax(code: string): Promise<SyntaxCheckResult> {
    const args = this.buildArgs('/output.stl', { backend: 'manifold' });
    const result = await this.sendRequest(code, args);
    const diagnostics = parseOpenScadStderr(result.stderr);

    return { diagnostics };
  }

  /**
   * Export a model in a specific format.
   */
  async exportModel(
    code: string,
    format: ExportFormat,
    options: { backend?: 'manifold' | 'cgal' | 'auto' } = {}
  ): Promise<Uint8Array> {
    const { backend = 'manifold' } = options;
    const outputPath = `/output.${format}`;
    const args = this.buildArgs(outputPath, { backend });

    // For binary STL (more compact)
    if (format === 'stl') {
      args.push('--export-format=binstl');
    }

    const result = await this.sendRequest(code, args);

    if (result.output.length === 0) {
      const diagnostics = parseOpenScadStderr(result.stderr);
      const errors = diagnostics.filter((d) => d.severity === 'error');
      if (errors.length > 0) {
        throw createExportValidationError(errors.map((e) => e.message));
      }
      throw new Error('Export produced no output');
    }

    return result.output;
  }

  /**
   * Cancel all pending renders by terminating the worker.
   * A new worker will be created on the next render call.
   */
  cancel(): void {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    // Reject all pending requests
    for (const [, pending] of this.pending) {
      pending.reject(new Error('Render cancelled'));
    }
    this.pending.clear();
    this.initPromise = null;
  }

  /**
   * Clear the render cache.
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Permanently dispose the service.
   */
  dispose(): void {
    this.disposed = true;
    this.cancel();
  }
}

// ============================================================================
// Factory
// ============================================================================

let globalInstance: IRenderService | null = null;

function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

// Promise that resolves once the NativeRenderService module is loaded (Tauri only).
// Kicked off eagerly at module load time so it's ready before first use.
let nativeServicePromise: Promise<typeof import('./nativeRenderService')> | null = null;
if (isTauri()) {
  nativeServicePromise = import('./nativeRenderService').catch((err) => {
    console.warn('[getRenderService] Failed to load NativeRenderService:', err);
    return null;
  }) as Promise<typeof import('./nativeRenderService')>;
}

/**
 * Get the singleton render service instance.
 * Returns NativeRenderService on desktop (Tauri), WasmRenderService on web.
 */
export function getRenderService(): IRenderService {
  if (!globalInstance) {
    globalInstance = new WasmRenderService();
  }
  return globalInstance;
}

/**
 * Ensure the correct render service is loaded.
 * On Tauri, waits for NativeRenderService to load and swaps it in.
 * On web, resolves immediately.
 * Call this once at startup before the first render.
 */
export async function ensureRenderService(): Promise<IRenderService> {
  if (nativeServicePromise) {
    const mod = await nativeServicePromise;
    if (mod && (!globalInstance || globalInstance instanceof WasmRenderService)) {
      if (globalInstance) globalInstance.dispose();
      globalInstance = new mod.NativeRenderService();
    }
  }
  if (!globalInstance) {
    globalInstance = new WasmRenderService();
  }
  return globalInstance;
}

/**
 * Replace the global render service instance (for testing).
 */
export function setRenderServiceForTesting(service: IRenderService | null): void {
  globalInstance = service;
}

// Keep backward compat alias during migration
export { WasmRenderService as RenderService };
