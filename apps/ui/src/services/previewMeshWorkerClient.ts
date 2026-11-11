import type { OffRgba } from './offMeshParser';
import type { PreviewMeshPayload } from './previewMeshPayload';
import type { PreviewMeshWorkerRequest, PreviewMeshWorkerResponse } from './previewMeshWorker';

/** Thrown when the worker itself is unusable (as opposed to the OFF being invalid). */
export class PreviewMeshWorkerUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PreviewMeshWorkerUnavailableError';
  }
}

interface Pending {
  resolve: (value: PreviewMeshPayload) => void;
  reject: (error: Error) => void;
}

let worker: Worker | null = null;
let workerBroken = false;
let nextRequestId = 1;
const pending = new Map<number, Pending>();

function failAll(message: string) {
  workerBroken = true;
  worker?.terminate();
  worker = null;
  for (const request of pending.values()) {
    request.reject(new PreviewMeshWorkerUnavailableError(message));
  }
  pending.clear();
}

function getWorker(): Worker | null {
  if (workerBroken || typeof Worker === 'undefined') {
    return null;
  }

  if (!worker) {
    try {
      worker = new Worker(new URL('./previewMeshWorker.ts', import.meta.url), { type: 'module' });
    } catch {
      workerBroken = true;
      return null;
    }

    worker.addEventListener('message', (event: MessageEvent<PreviewMeshWorkerResponse>) => {
      const response = event.data;
      const request = pending.get(response.id);
      if (!request) return;
      pending.delete(response.id);

      if (response.ok) {
        request.resolve({ mesh: response.mesh, bvh: response.bvh, timings: response.timings });
      } else {
        request.reject(new Error(response.error));
      }
    });
    worker.addEventListener('error', (event) => {
      failAll(event.message || 'Preview mesh worker failed to load');
    });
    worker.addEventListener('messageerror', () => {
      failAll('Preview mesh worker returned an unreadable message');
    });
  }

  return worker;
}

export function isPreviewMeshWorkerAvailable(): boolean {
  return !workerBroken && typeof Worker !== 'undefined';
}

/**
 * Parse OFF bytes off the main thread. The buffer is transferred, so callers
 * must not use it afterwards. Rejects with `PreviewMeshWorkerUnavailableError`
 * when the worker cannot be used, in which case the caller should fall back to
 * parsing on the main thread.
 */
export function parseOffMeshInWorker(
  buffer: ArrayBuffer,
  fallbackColor: OffRgba
): Promise<PreviewMeshPayload> {
  const activeWorker = getWorker();
  if (!activeWorker) {
    return Promise.reject(new PreviewMeshWorkerUnavailableError('Web Workers are unavailable'));
  }

  return new Promise<PreviewMeshPayload>((resolve, reject) => {
    const id = nextRequestId;
    nextRequestId += 1;
    pending.set(id, { resolve, reject });
    const request: PreviewMeshWorkerRequest = { id, buffer, fallbackColor };
    activeWorker.postMessage(request, [buffer]);
  });
}
