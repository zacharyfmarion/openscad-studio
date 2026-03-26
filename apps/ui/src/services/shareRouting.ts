import type { ShareContext, ShareMode } from '../types/share';

const SHARE_PATH_REGEX = /^\/s\/([a-zA-Z0-9_-]{1,20})\/?$/;

function parseShareModeParam(mode: string | null): ShareMode {
  switch (mode) {
    case 'default':
    case 'ai-first':
    case 'customizer-first':
      return mode;
    case 'editor':
      return 'default';
    case 'customizer':
    default:
      return 'customizer-first';
  }
}

export function parseShareContext(pathname: string, search: string = ''): ShareContext | null {
  const match = pathname.match(SHARE_PATH_REGEX);
  if (!match) {
    return null;
  }

  const params = new URLSearchParams(search);
  return {
    shareId: match[1],
    mode: parseShareModeParam(params.get('mode')),
  };
}

export function buildShareUrl(baseUrl: string, shareId: string, mode: ShareMode): string {
  const url = new URL(`/s/${shareId}`, baseUrl);
  if (mode !== 'customizer-first') {
    url.searchParams.set('mode', mode);
  }
  return url.toString();
}
