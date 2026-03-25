import { getShareUrl, getThumbnailUrl, readShare, type Env } from '../_lib/share';

function normalizeShareIdParam(value: string | string[] | undefined): string | null {
  if (typeof value === 'string') {
    return value;
  }

  if (Array.isArray(value) && value.length === 1 && typeof value[0] === 'string') {
    return value[0];
  }

  return null;
}

function formatRawParamValue(value: string | string[] | undefined): string {
  if (typeof value === 'string') {
    return value;
  }

  if (Array.isArray(value)) {
    return value.join('/');
  }

  return 'missing';
}

function replaceMetaTag(
  html: string,
  selector: { attr: string; name: string },
  content: string
): string {
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

function withShareDebugHeaders(
  response: Response,
  debug: {
    rawParam: string | string[] | undefined;
    shareId: string | null;
    shareFound: boolean;
    metadataApplied: boolean;
    hasThumbnail: boolean;
    ogTitle: string | null;
    ogImage: string | null;
    twitterCard: string | null;
  }
): Response {
  const headers = new Headers(response.headers);
  headers.set('x-share-meta-route', 'functions/s/[[shareId]]');
  headers.set(
    'x-share-param-type',
    Array.isArray(debug.rawParam) ? 'array' : debug.rawParam ? 'string' : 'missing'
  );
  headers.set('x-share-param-raw', formatRawParamValue(debug.rawParam));
  headers.set('x-share-id', debug.shareId ?? 'missing');
  headers.set('x-share-found', debug.shareFound ? 'true' : 'false');
  headers.set('x-share-meta-applied', debug.metadataApplied ? 'true' : 'false');
  headers.set('x-share-thumbnail', debug.hasThumbnail ? 'true' : 'false');
  headers.set('x-share-og-title', debug.ogTitle ?? 'missing');
  headers.set('x-share-og-image', debug.ogImage ?? 'missing');
  headers.set('x-share-twitter-card', debug.twitterCard ?? 'missing');

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

async function handleShareMeta(context: EventContext<Env, string, unknown>) {
  const rawShareParam = context.params.shareId;
  const shareId = normalizeShareIdParam(rawShareParam);
  const response = await context.next();

  if (!shareId) {
    console.info(
      '[share-meta]',
      JSON.stringify({
        route: 'functions/s/[[shareId]]',
        rawParam: rawShareParam,
        shareId: null,
        shareFound: false,
        metadataApplied: false,
        hasThumbnail: false,
      })
    );

    return withShareDebugHeaders(response, {
      rawParam: rawShareParam,
      shareId: null,
      shareFound: false,
      metadataApplied: false,
      hasThumbnail: false,
      ogTitle: null,
      ogImage: null,
      twitterCard: null,
    });
  }

  const share = await readShare(context.env, shareId);
  if (!share) {
    console.info(
      '[share-meta]',
      JSON.stringify({
        route: 'functions/s/[[shareId]]',
        rawParam: rawShareParam,
        shareId,
        shareFound: false,
        metadataApplied: false,
        hasThumbnail: false,
      })
    );

    return withShareDebugHeaders(response, {
      rawParam: rawShareParam,
      shareId,
      shareFound: false,
      metadataApplied: false,
      hasThumbnail: false,
      ogTitle: null,
      ogImage: null,
      twitterCard: null,
    });
  }

  const html = await response.text();
  const origin = new URL(context.request.url).origin;
  const shareUrl = getShareUrl(origin, shareId);
  const thumbnailUrl = share.thumbnailKey
    ? getThumbnailUrl(origin, shareId)
    : `${origin}/icon-512.png`;
  const ogTitle = `${share.title} — OpenSCAD Studio`;
  const twitterCard = share.thumbnailKey ? 'summary_large_image' : 'summary';

  const updated = [
    [{ attr: 'property', name: 'og:title' }, ogTitle],
    [
      { attr: 'property', name: 'og:description' },
      'Open this parametric design in OpenSCAD Studio. Customize parameters and download STL for 3D printing.',
    ],
    [{ attr: 'property', name: 'og:image' }, thumbnailUrl],
    [{ attr: 'property', name: 'og:url' }, shareUrl],
    [{ attr: 'name', name: 'twitter:card' }, twitterCard],
    [{ attr: 'name', name: 'twitter:title' }, ogTitle],
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
  const rewrittenResponse = new Response(updated, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });

  console.info(
    '[share-meta]',
    JSON.stringify({
      route: 'functions/s/[[shareId]]',
      rawParam: rawShareParam,
      shareId,
      shareFound: true,
      metadataApplied: true,
      hasThumbnail: Boolean(share.thumbnailKey),
    })
  );

  return withShareDebugHeaders(rewrittenResponse, {
    rawParam: rawShareParam,
    shareId,
    shareFound: true,
    metadataApplied: true,
    hasThumbnail: Boolean(share.thumbnailKey),
    ogTitle,
    ogImage: thumbnailUrl,
    twitterCard,
  });
}

export const onRequestGet: PagesFunction<Env> = handleShareMeta;
export const onRequestHead: PagesFunction<Env> = handleShareMeta;
