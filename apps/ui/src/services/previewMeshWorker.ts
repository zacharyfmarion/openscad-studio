/// <reference lib="webworker" />

/**
 * Off-main-thread OFF parsing for the 3D preview.
 *
 * Large renders used to freeze the UI while the OFF text was parsed and
 * normals were computed. This worker does that work, and additionally builds a
 * BVH per mesh group so hover/measure raycasts stay fast on dense models.
 */

import type { OffRgba } from './offMeshParser';
import { buildPreviewMeshPayload, type PreviewMeshPayload } from './previewMeshPayload';

declare const self: DedicatedWorkerGlobalScope;

export interface PreviewMeshWorkerRequest {
  id: number;
  buffer: ArrayBuffer;
  fallbackColor: OffRgba;
}

export type PreviewMeshWorkerResponse =
  | ({ id: number; ok: true } & PreviewMeshPayload)
  | { id: number; ok: false; error: string };

self.addEventListener('message', (event: MessageEvent<PreviewMeshWorkerRequest>) => {
  const { id, buffer, fallbackColor } = event.data;

  try {
    const { payload, transfer } = buildPreviewMeshPayload(new Uint8Array(buffer), fallbackColor);
    const response: PreviewMeshWorkerResponse = { id, ok: true, ...payload };
    self.postMessage(response, transfer);
  } catch (error) {
    const response: PreviewMeshWorkerResponse = {
      id,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
    self.postMessage(response);
  }
});
