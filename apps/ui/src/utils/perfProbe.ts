/**
 * Opt-in performance instrumentation used by `benchmarks/viewer`.
 *
 * Everything here is a no-op unless `window.__OPENSCAD_STUDIO_PERF__` is set
 * before the app boots (the benchmark harness does this with an init script),
 * so production sessions never accumulate User Timing entries.
 */

export interface ViewerPerfStats {
  /** Frames the WebGL viewer has actually rendered since it mounted. */
  frames: number;
  /** Triangles in the currently loaded preview model. */
  triangles: number;
  /** Version (blob URL) of the currently loaded preview model. */
  modelVersion: string | null;
}

declare global {
  interface Window {
    __OPENSCAD_STUDIO_PERF__?: boolean;
    __VIEWER_PERF__?: { stats: () => ViewerPerfStats };
  }
}

export function isPerfProbeEnabled(): boolean {
  return typeof window !== 'undefined' && window.__OPENSCAD_STUDIO_PERF__ === true;
}

/** Start timestamp for a later `perfMeasure`, or -1 when the probe is disabled. */
export function perfNow(): number {
  return isPerfProbeEnabled() ? performance.now() : -1;
}

/** Record a User Timing measure named `studio:<name>` spanning `startedAt` → now. */
export function perfMeasure(name: string, startedAt: number, detail?: Record<string, unknown>) {
  if (startedAt < 0 || !isPerfProbeEnabled()) {
    return;
  }

  try {
    performance.measure(`studio:${name}`, {
      start: startedAt,
      end: performance.now(),
      detail,
    });
  } catch {
    // User Timing L3 unavailable — the benchmark only targets modern Chromium.
  }
}
