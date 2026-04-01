import type { WorkspacePreset } from '../stores/layoutStore';

export type ShareMode = Extract<WorkspacePreset, 'default' | 'ai-first' | 'customizer-first'>;
export type ShareEntryPhase =
  | 'idle'
  | 'fetching'
  | 'applying'
  | 'rendering'
  | 'ready'
  | 'error'
  | 'skipped';

export interface ShareContext {
  shareId: string;
  mode: ShareMode;
}

export interface ShareData {
  id: string;
  code: string;
  title: string;
  createdAt: string;
  forkedFrom: string | null;
  thumbnailUrl: string | null;
  files?: Record<string, string>;
  renderTarget?: string;
}

export interface CreateShareRequest {
  code?: string;
  files?: Record<string, string>;
  renderTarget?: string;
  title: string;
  forkedFrom?: string | null;
}

export function isMultiFileShare(
  data: ShareData
): data is ShareData & { files: Record<string, string>; renderTarget: string } {
  return data.files !== undefined && data.renderTarget !== undefined;
}

export interface CreateShareResponse {
  id: string;
  url: string;
  thumbnailUploadToken: string;
}

export interface ShareOrigin extends ShareContext {
  title: string;
  forkedFrom: string | null;
}

export interface ShareEntryState {
  context: ShareContext | null;
  phase: ShareEntryPhase;
  shareData: ShareData | null;
  origin: ShareOrigin | null;
  error: string | null;
  isBannerDismissed: boolean;
  targetTabId: string | null;
}
