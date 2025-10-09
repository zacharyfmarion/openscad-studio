import { invoke } from '@tauri-apps/api/core';

// Types matching Rust backend
export interface Diagnostic {
  severity: 'error' | 'warning' | 'info';
  line?: number;
  col?: number;
  message: string;
}

export type BackendType = 'manifold' | 'cgal' | 'auto';
export type ViewMode = '3d' | '2d';
export type RenderKind = 'png' | 'svg' | 'mesh';

export interface Size {
  w: number;
  h: number;
}

export interface RenderPreviewRequest {
  source: string;
  backend?: BackendType;
  view?: ViewMode;
  size?: Size;
  render_mesh?: boolean;
}

export interface RenderPreviewResponse {
  kind: RenderKind;
  path: string;
  diagnostics: Diagnostic[];
}

export interface DetectBackendResponse {
  has_manifold: boolean;
  version: string;
}

export interface LocateOpenScadRequest {
  explicit_path?: string;
}

export interface LocateOpenScadResponse {
  exe_path: string;
}

// API functions
export async function locateOpenScad(
  request: LocateOpenScadRequest = {}
): Promise<LocateOpenScadResponse> {
  return await invoke('locate_openscad', { request });
}

export async function renderPreview(
  openscadPath: string,
  request: RenderPreviewRequest
): Promise<RenderPreviewResponse> {
  return await invoke('render_preview', {
    openscadPath,
    request
  });
}

export async function detectBackend(
  openscadPath: string
): Promise<DetectBackendResponse> {
  return await invoke('detect_backend', { openscadPath });
}
