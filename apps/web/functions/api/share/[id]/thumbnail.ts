import {
  getThumbnailUrl,
  hashToken,
  json,
  readShare,
  type Env,
  writeShare,
} from '../../../_lib/share';

function getBearerToken(request: Request): string | null {
  const header = request.headers.get('Authorization') || '';
  if (!header.startsWith('Bearer ')) {
    return null;
  }
  const token = header.slice('Bearer '.length).trim();
  return token || null;
}

async function buildThumbnailResponse(
  context: EventContext<Env, string, unknown>,
  includeBody: boolean
) {
  const shareId = context.params.id;
  if (!shareId || typeof shareId !== 'string') {
    return json({ error: 'Missing share id.' }, { status: 400 });
  }

  const share = await readShare(context.env, shareId);
  if (!share?.thumbnailKey) {
    return json({ error: 'Thumbnail not found.' }, { status: 404 });
  }

  const object = includeBody
    ? await context.env.SHARE_R2.get(share.thumbnailKey)
    : await context.env.SHARE_R2.head(share.thumbnailKey);
  if (!object) {
    return json({ error: 'Thumbnail not found.' }, { status: 404 });
  }

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('etag', object.httpEtag);
  headers.set('Cache-Control', 'public, max-age=31536000, immutable');
  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'image/png');
  }
  return new Response(includeBody ? object.body : null, { headers });
}

export const onRequestGet: PagesFunction<Env> = async (context) =>
  buildThumbnailResponse(context, true);

export const onRequestHead: PagesFunction<Env> = async (context) =>
  buildThumbnailResponse(context, false);

export const onRequestPut: PagesFunction<Env> = async (context) => {
  const shareId = context.params.id;
  if (!shareId || typeof shareId !== 'string') {
    return json({ error: 'Missing share id.' }, { status: 400 });
  }

  const share = await readShare(context.env, shareId);
  if (!share) {
    return json({ error: 'Design not found' }, { status: 404 });
  }

  const contentType = context.request.headers.get('Content-Type') || '';
  if (!contentType.includes('image/png')) {
    return json({ error: 'Expected image/png.' }, { status: 400 });
  }

  if (share.thumbnailKey || !share.thumbnailUploadTokenHash) {
    return json({ error: 'Thumbnail already exists for this share.' }, { status: 409 });
  }

  const token = getBearerToken(context.request);
  if (!token) {
    return json({ error: 'Missing thumbnail upload token.' }, { status: 401 });
  }

  const providedHash = await hashToken(token);
  if (providedHash !== share.thumbnailUploadTokenHash) {
    return json({ error: 'Invalid thumbnail upload token.' }, { status: 401 });
  }

  const arrayBuffer = await context.request.arrayBuffer();
  if (arrayBuffer.byteLength > 512 * 1024) {
    return json({ error: 'Thumbnail is too large.' }, { status: 413 });
  }

  const thumbnailKey = `thumbnails/${shareId}.png`;
  await context.env.SHARE_R2.put(thumbnailKey, arrayBuffer, {
    httpMetadata: {
      contentType: 'image/png',
      cacheControl: 'public, max-age=31536000, immutable',
    },
  });

  await writeShare(context.env, {
    ...share,
    thumbnailKey,
    thumbnailUploadTokenHash: null,
  });

  return json({
    thumbnailUrl: getThumbnailUrl(new URL(context.request.url).origin, shareId),
  });
};
