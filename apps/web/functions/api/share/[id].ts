import {
  decompressSource,
  extractPrimaryCode,
  getThumbnailUrl,
  json,
  readShare,
  type Env,
  type ProjectSharePayload,
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

  const decompressed = await decompressSource(share.code);
  const thumbnailUrl = share.thumbnailKey
    ? getThumbnailUrl(new URL(context.request.url).origin, share.id)
    : null;

  if (share.format === 'project') {
    const payload = JSON.parse(decompressed) as ProjectSharePayload;
    return json({
      id: share.id,
      code: payload.files[payload.renderTarget] ?? '',
      files: payload.files,
      renderTarget: payload.renderTarget,
      title: share.title,
      createdAt: share.createdAt,
      forkedFrom: share.forkedFrom,
      thumbnailUrl,
    });
  }

  return json({
    id: share.id,
    code: decompressed,
    title: share.title,
    createdAt: share.createdAt,
    forkedFrom: share.forkedFrom,
    thumbnailUrl,
  });
};
