export type ShareMode = 'customizer' | 'editor';
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
}

export interface CreateShareRequest {
  code: string;
  title: string;
  forkedFrom?: string | null;
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
