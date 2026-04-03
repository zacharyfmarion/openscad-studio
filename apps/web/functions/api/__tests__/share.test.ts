import { onRequestPost } from '../share';
import { decompressSource } from '../../_lib/share';
import { createMockEnv, createPagesContext } from '../../__tests__/test-utils';

describe('POST /api/share', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-03-29T18:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('rejects non-JSON requests and invalid payloads', async () => {
    const { env } = createMockEnv();

    const invalidType = await onRequestPost(
      createPagesContext({
        request: new Request('https://studio.test/api/share', {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain' },
          body: 'oops',
        }),
        env: env as never,
      }) as never
    );
    expect(invalidType.status).toBe(400);
    await expect(invalidType.json()).resolves.toEqual({ error: 'Expected application/json.' });

    const invalidCode = await onRequestPost(
      createPagesContext({
        request: new Request('https://studio.test/api/share', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: '' }),
        }),
        env: env as never,
      }) as never
    );
    expect(invalidCode.status).toBe(400);
    await expect(invalidCode.json()).resolves.toEqual({ error: 'Missing or invalid code.' });
  });

  it('rejects oversized payloads and returns a 500 when unique ids cannot be created', async () => {
    const largeCode = 'x'.repeat(51_201);
    const { env, kvStore } = createMockEnv();

    const oversized = await onRequestPost(
      createPagesContext({
        request: new Request('https://studio.test/api/share', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: largeCode }),
        }),
        env: env as never,
      }) as never
    );
    expect(oversized.status).toBe(413);
    await expect(oversized.json()).resolves.toEqual({ error: 'Design is too large (50KB max).' });

    kvStore.set(
      'share:aaaaaaaa',
      JSON.stringify({
        id: 'aaaaaaaa',
        code: 'existing',
        title: 'Existing',
        createdAt: '2026-03-29T18:00:00.000Z',
        forkedFrom: null,
        thumbnailKey: null,
        thumbnailUploadTokenHash: null,
        codeSize: 8,
      })
    );

    const randomSpy = jest
      .spyOn(globalThis.crypto, 'getRandomValues')
      .mockImplementation((buffer: Uint8Array) => {
        buffer.fill(0);
        return buffer;
      });

    const exhausted = await onRequestPost(
      createPagesContext({
        request: new Request('https://studio.test/api/share', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: 'cube(10);' }),
        }),
        env: env as never,
      }) as never
    );
    randomSpy.mockRestore();

    expect(exhausted.status).toBe(500);
    await expect(exhausted.json()).resolves.toEqual({
      error: 'Unable to create a unique share link right now.',
    });
  });

  it('persists a sanitized share record and returns the share URL plus thumbnail token', async () => {
    const { env, kvStore } = createMockEnv();

    const response = await onRequestPost(
      createPagesContext({
        request: new Request('https://studio.test/api/share', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'cf-connecting-ip': '198.51.100.7' },
          body: JSON.stringify({
            code: 'cube([10, 10, 10]);',
            title: '  Useful Part  ',
            forkedFrom: 'abc12345',
          }),
        }),
        env: env as never,
      }) as never
    );

    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      id: string;
      url: string;
      thumbnailUploadToken: string;
    };
    expect(payload.id).toHaveLength(8);
    expect(payload.url).toBe(`https://studio.test/s/${payload.id}`);
    expect(payload.thumbnailUploadToken).toBeTruthy();

    const stored = JSON.parse(kvStore.get(`share:${payload.id}`) ?? '{}') as {
      code: string;
      title: string;
      forkedFrom: string | null;
      thumbnailUploadTokenHash: string | null;
      codeSize: number;
    };
    expect(stored.title).toBe('Useful Part');
    expect(stored.forkedFrom).toBe('abc12345');
    expect(stored.thumbnailUploadTokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(stored.codeSize).toBe(new TextEncoder().encode('cube([10, 10, 10]);').length);
    await expect(decompressSource(stored.code)).resolves.toBe('cube([10, 10, 10]);');
    expect(kvStore.get('ratelimit:198.51.100.7:2026-3-29-18')).toBe('1');
  });

  it('accepts .h files in multi-file project shares but requires a .scad render target', async () => {
    const { env, kvStore } = createMockEnv();

    const response = await onRequestPost(
      createPagesContext({
        request: new Request('https://studio.test/api/share', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            files: {
              'main.scad': 'include <lib/constants.h>\ncube([part_w, part_d, part_h]);',
              'lib/constants.h': 'part_w = 12; part_d = 8; part_h = 4;',
            },
            renderTarget: 'main.scad',
          }),
        }),
        env: env as never,
      }) as never
    );

    expect(response.status).toBe(200);
    const payload = (await response.json()) as { id: string };
    const stored = JSON.parse(kvStore.get(`share:${payload.id}`) ?? '{}') as { code: string };
    const decoded = JSON.parse(await decompressSource(stored.code)) as {
      files: Record<string, string>;
      renderTarget: string;
    };

    expect(decoded.renderTarget).toBe('main.scad');
    expect(decoded.files['lib/constants.h']).toContain('part_w');

    const invalidRenderTarget = await onRequestPost(
      createPagesContext({
        request: new Request('https://studio.test/api/share', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            files: {
              'main.scad': 'cube(10);',
              'lib/constants.h': 'size = 10;',
            },
            renderTarget: 'lib/constants.h',
          }),
        }),
        env: env as never,
      }) as never
    );

    expect(invalidRenderTarget.status).toBe(400);
    await expect(invalidRenderTarget.json()).resolves.toEqual({
      error: 'renderTarget must be a renderable .scad file in the project.',
    });
  });
});
