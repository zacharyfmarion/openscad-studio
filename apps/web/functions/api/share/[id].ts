import {
  decompressSource,
  getThumbnailUrl,
  json,
  readShare,
  type Env,
} from '../../_lib/share';

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const shareId = context.params.id;
  if (!shareId || typeof shareId !== 'string') {
    return json({ error: 'Missing share id.' }, { status: 400 });
  }

  const share = await readShare(context.env, shareId);
  if (!share) {
    return json({ error: 'Design not found' }, { status: 404 });
  }

  const code = await decompressSource(share.code);
  return json({
    id: share.id,
    code,
    title: share.title,
    createdAt: share.createdAt,
    forkedFrom: share.forkedFrom,
    thumbnailUrl: share.thumbnailKey
      ? getThumbnailUrl(new URL(context.request.url).origin, share.id)
      : null,
  });
};
