import {
  compressSource,
  decompressSource,
  enforceShareRateLimit,
  extractClientIp,
  getShareUrl,
  getThumbnailUrl,
  hashToken,
  json,
  parseShareRecord,
  readShare,
  sanitizeTitle,
  validateForkedFrom,
  writeShare,
} from '../share';
import { createMockEnv } from '../../__tests__/test-utils';

describe('share helper utilities', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-03-29T15:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('formats JSON responses and share URLs', async () => {
    const response = json({ ok: true }, { status: 201 });

    expect(response.status).toBe(201);
    expect(response.headers.get('Content-Type')).toBe('application/json; charset=utf-8');
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(getShareUrl('https://studio.test', 'abc12345')).toBe('https://studio.test/s/abc12345');
    expect(getThumbnailUrl('https://studio.test', 'abc12345')).toBe(
      'https://studio.test/api/share/abc12345/thumbnail'
    );
  });

  it('sanitizes title and fork references', () => {
    expect(sanitizeTitle('  Useful Design  ')).toBe('Useful Design');
    expect(sanitizeTitle('')).toBe('Untitled Design');
    expect(sanitizeTitle(null)).toBe('Untitled Design');
    expect(validateForkedFrom('abc12345')).toBe('abc12345');
    expect(validateForkedFrom('abc')).toBeNull();
    expect(validateForkedFrom(123)).toBeNull();
  });

  it('extracts client IP from Cloudflare or forwarded headers and rate-limits per hour', async () => {
    const { env, kvStore } = createMockEnv();
    const request = new Request('https://studio.test/api/share', {
      headers: {
        'x-forwarded-for': '203.0.113.9, 10.0.0.1',
      },
    });

    expect(extractClientIp(request)).toBe('203.0.113.9');

    const first = await enforceShareRateLimit(request, env as never);
    expect(first).toBeNull();
    expect(kvStore.get('ratelimit:203.0.113.9:2026-3-29-15')).toBe('1');

    kvStore.set('ratelimit:203.0.113.9:2026-3-29-15', '30');
    const limited = await enforceShareRateLimit(request, env as never);
    expect(limited?.status).toBe(429);
    await expect(limited?.json()).resolves.toEqual({
      error: 'Too many shares. Try again in a few minutes.',
    });
  });

  it('round-trips compressed source, hashes tokens, and reads persisted share records', async () => {
    const { env } = createMockEnv();
    const compressed = await compressSource('cube([10, 10, 10]);');
    await expect(decompressSource(compressed)).resolves.toBe('cube([10, 10, 10]);');

    const digest = await hashToken('thumbnail-token');
    expect(digest).toMatch(/^[0-9a-f]{64}$/);

    const shareRecord = {
      id: 'abc12345',
      code: compressed,
      title: 'Bracket',
      createdAt: '2026-03-29T15:00:00.000Z',
      forkedFrom: null,
      thumbnailKey: null,
      thumbnailUploadTokenHash: digest,
      codeSize: 21,
    };

    await writeShare(env as never, shareRecord);
    await expect(readShare(env as never, 'abc12345')).resolves.toEqual(shareRecord);
    await expect(parseShareRecord(JSON.stringify(shareRecord))).resolves.toEqual(shareRecord);
    await expect(parseShareRecord(null)).resolves.toBeNull();
  });
});
