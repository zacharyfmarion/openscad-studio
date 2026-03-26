import type { CreateShareRequest, CreateShareResponse, ShareData } from '../types/share';

export function getShareApiBase(): string {
  return window.__SHARE_API_BASE || 'https://openscad-studio.pages.dev';
}

export function isShareEnabled(): boolean {
  return window.__SHARE_ENABLED === true;
}

type ShareErrorOptions = {
  status: number;
  message: string;
};

export class ShareRequestError extends Error {
  readonly status: number;

  constructor({ status, message }: ShareErrorOptions) {
    super(message);
    this.name = 'ShareRequestError';
    this.status = status;
  }
}

async function readJsonResponse<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

async function toShareError(
  response: Response,
  fallbackMessage: string
): Promise<ShareRequestError> {
  try {
    const payload = (await response.json()) as { error?: string };
    return new ShareRequestError({
      status: response.status,
      message: payload.error?.trim() || fallbackMessage,
    });
  } catch {
    return new ShareRequestError({
      status: response.status,
      message: fallbackMessage,
    });
  }
}

export async function createShare(req: CreateShareRequest): Promise<CreateShareResponse> {
  const response = await fetch(`${getShareApiBase()}/api/share`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(req),
  });

  if (!response.ok) {
    throw await toShareError(response, "Couldn't create link.");
  }

  return readJsonResponse<CreateShareResponse>(response);
}

export async function getShare(shareId: string): Promise<ShareData> {
  const response = await fetch(`${getShareApiBase()}/api/share/${encodeURIComponent(shareId)}`);

  if (!response.ok) {
    throw await toShareError(response, "Couldn't load this design.");
  }

  return readJsonResponse<ShareData>(response);
}

export async function uploadThumbnail(
  shareId: string,
  pngBlob: Blob,
  thumbnailUploadToken: string
): Promise<void> {
  const response = await fetch(
    `${getShareApiBase()}/api/share/${encodeURIComponent(shareId)}/thumbnail`,
    {
      method: 'PUT',
      headers: {
        'Content-Type': 'image/png',
        Authorization: `Bearer ${thumbnailUploadToken}`,
      },
      body: pngBlob,
    }
  );

  if (!response.ok) {
    throw await toShareError(response, 'Thumbnail upload failed.');
  }
}
