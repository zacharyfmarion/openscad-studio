import { getShareUrl, getThumbnailUrl, readShare, type Env } from '../_lib/share';

function replaceMetaTag(html: string, selector: { attr: string; name: string }, content: string): string {
  const escapedName = selector.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(
    `<meta\\s+${selector.attr}=["']${escapedName}["']\\s+content=["'][^"']*["']\\s*\\/?>`,
    'i'
  );
  const replacement = `<meta ${selector.attr}="${selector.name}" content="${content}" />`;
  if (pattern.test(html)) {
    return html.replace(pattern, replacement);
  }
  return html.replace('</head>', `  ${replacement}\n  </head>`);
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const shareId = context.params.shareId;
  const response = await context.next();

  if (!shareId || typeof shareId !== 'string') {
    return response;
  }

  const share = await readShare(context.env, shareId);
  if (!share) {
    return response;
  }

  const html = await response.text();
  const origin = new URL(context.request.url).origin;
  const shareUrl = getShareUrl(origin, shareId);
  const thumbnailUrl = share.thumbnailKey ? getThumbnailUrl(origin, shareId) : `${origin}/icon-512.png`;

  const updated = [
    [{ attr: 'property', name: 'og:title' }, `${share.title} — OpenSCAD Studio`],
    [
      { attr: 'property', name: 'og:description' },
      'Open this parametric design in OpenSCAD Studio. Customize parameters and download STL for 3D printing.',
    ],
    [{ attr: 'property', name: 'og:image' }, thumbnailUrl],
    [{ attr: 'property', name: 'og:url' }, shareUrl],
    [{ attr: 'name', name: 'twitter:card' }, share.thumbnailKey ? 'summary_large_image' : 'summary'],
    [{ attr: 'name', name: 'twitter:title' }, `${share.title} — OpenSCAD Studio`],
    [
      { attr: 'name', name: 'twitter:description' },
      'Open this parametric design in OpenSCAD Studio. Customize parameters and download STL for 3D printing.',
    ],
    [{ attr: 'name', name: 'twitter:image' }, thumbnailUrl],
  ].reduce(
    (acc, [selector, content]) =>
      replaceMetaTag(acc, selector as { attr: string; name: string }, content as string),
    html
  );

  const headers = new Headers(response.headers);
  headers.set('Cross-Origin-Embedder-Policy', 'require-corp');
  headers.set('Cross-Origin-Opener-Policy', 'same-origin');
  headers.set('Content-Type', 'text/html; charset=utf-8');
  return new Response(updated, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
};
