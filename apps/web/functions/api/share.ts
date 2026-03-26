import {
  compressSource,
  enforceShareRateLimit,
  getShareUrl,
  hashToken,
  json,
  randomShareId,
  randomToken,
  readShare,
  sanitizeTitle,
  type Env,
  validateForkedFrom,
  writeShare,
} from '../_lib/share';

type CreateShareBody = {
  code?: unknown;
  title?: unknown;
  forkedFrom?: unknown;
};

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const contentType = request.headers.get('Content-Type') || '';
  if (!contentType.includes('application/json')) {
    return json({ error: 'Expected application/json.' }, { status: 400 });
  }

  const rateLimitResponse = await enforceShareRateLimit(request, env);
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  const body = (await request.json()) as CreateShareBody;
  if (typeof body.code !== 'string' || body.code.length === 0) {
    return json({ error: 'Missing or invalid code.' }, { status: 400 });
  }

  const codeSize = new TextEncoder().encode(body.code).length;
  if (codeSize > 51_200) {
    return json({ error: 'Design is too large (50KB max).' }, { status: 413 });
  }

  const title = sanitizeTitle(body.title);
  const forkedFrom = validateForkedFrom(body.forkedFrom);
  const thumbnailUploadToken = randomToken();
  const thumbnailUploadTokenHash = await hashToken(thumbnailUploadToken);
  const compressedCode = await compressSource(body.code);

  let shareId = '';
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const candidate = randomShareId();
    const existing = await readShare(env, candidate);
    if (!existing) {
      shareId = candidate;
      break;
    }
  }

  if (!shareId) {
    return json({ error: 'Unable to create a unique share link right now.' }, { status: 500 });
  }

  await writeShare(env, {
    id: shareId,
    code: compressedCode,
    title,
    createdAt: new Date().toISOString(),
    forkedFrom,
    thumbnailKey: null,
    thumbnailUploadTokenHash,
    codeSize,
  });

  return json({
    id: shareId,
    url: getShareUrl(new URL(request.url).origin, shareId),
    thumbnailUploadToken,
  });
};
