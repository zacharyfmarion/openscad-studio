import type { ShareContext, ShareMode } from '../types/share';

const SHARE_PATH_REGEX = /^\/s\/([a-zA-Z0-9_-]{1,20})\/?$/;

export function parseShareContext(
  pathname: string,
  search: string = ''
): ShareContext | null {
  const match = pathname.match(SHARE_PATH_REGEX);
  if (!match) {
    return null;
  }

  const params = new URLSearchParams(search);
  return {
    shareId: match[1],
    mode: params.get('mode') === 'editor' ? 'editor' : 'customizer',
  };
}

export function buildShareUrl(baseUrl: string, shareId: string, mode: ShareMode): string {
  const url = new URL(`/s/${shareId}`, baseUrl);
  if (mode === 'editor') {
    url.searchParams.set('mode', 'editor');
  }
  return url.toString();
}
