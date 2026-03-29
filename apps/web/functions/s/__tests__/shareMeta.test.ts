import { onRequestGet, onRequestHead } from '../[[shareId]]';
import { createMockEnv, createPagesContext } from '../../__tests__/test-utils';

function buildHtmlResponse() {
  return new Response(
    `<!doctype html><html><head>
      <meta property="og:title" content="Base Title" />
      <meta property="og:image" content="/base.png" />
      <meta name="twitter:card" content="summary" />
    </head><body>hi</body></html>`,
    {
      status: 200,
      headers: { 'Content-Type': 'text/html' },
    }
  );
}

describe('/s/[[shareId]] metadata rewriting', () => {
  it('passes through responses with debug headers when the share id is missing or not found', async () => {
    const { env } = createMockEnv();

    const missingParam = await onRequestGet(
      createPagesContext({
        request: new Request('https://studio.test/s'),
        env: env as never,
        params: {},
        next: async () => new Response('plain'),
      }) as never
    );
    expect(missingParam.headers.get('x-share-found')).toBe('false');
    expect(missingParam.headers.get('x-share-id')).toBe('missing');
    expect(await missingParam.text()).toBe('plain');

    const notFound = await onRequestGet(
      createPagesContext({
        request: new Request('https://studio.test/s/abc12345'),
        env: env as never,
        params: { shareId: 'abc12345' },
        next: async () => new Response('not-found'),
      }) as never
    );
    expect(notFound.headers.get('x-share-found')).toBe('false');
    expect(notFound.headers.get('x-share-id')).toBe('abc12345');
    expect(await notFound.text()).toBe('not-found');
  });

  it('rewrites OG/Twitter metadata and applies COEP/COOP headers for shares without thumbnails', async () => {
    const { env, kvStore } = createMockEnv({
      'share:abc12345': JSON.stringify({
        id: 'abc12345',
        code: 'compressed',
        title: 'Bracket',
        createdAt: '2026-03-29T18:00:00.000Z',
        forkedFrom: null,
        thumbnailKey: null,
        thumbnailUploadTokenHash: null,
        codeSize: 11,
      }),
    });
    expect(kvStore.size).toBeGreaterThan(0);

    const response = await onRequestGet(
      createPagesContext({
        request: new Request('https://studio.test/s/abc12345'),
        env: env as never,
        params: { shareId: 'abc12345' },
        next: async () => buildHtmlResponse(),
      }) as never
    );

    const html = await response.text();
    expect(html).toContain('content="Bracket — OpenSCAD Studio"');
    expect(html).toContain('content="https://studio.test/icon-512.png"');
    expect(html).toContain('content="https://studio.test/s/abc12345"');
    expect(response.headers.get('Cross-Origin-Embedder-Policy')).toBe('require-corp');
    expect(response.headers.get('Cross-Origin-Opener-Policy')).toBe('same-origin');
    expect(response.headers.get('x-share-meta-applied')).toBe('true');
    expect(response.headers.get('x-share-thumbnail')).toBe('false');
    expect(response.headers.get('x-share-twitter-card')).toBe('summary');
  });

  it('uses the uploaded thumbnail URL and large twitter card when a thumbnail exists', async () => {
    const { env } = createMockEnv({
      'share:abc12345': JSON.stringify({
        id: 'abc12345',
        code: 'compressed',
        title: 'Bracket',
        createdAt: '2026-03-29T18:00:00.000Z',
        forkedFrom: null,
        thumbnailKey: 'thumbs/abc12345.png',
        thumbnailUploadTokenHash: null,
        codeSize: 11,
      }),
    });

    const response = await onRequestHead(
      createPagesContext({
        request: new Request('https://studio.test/s/abc12345', { method: 'HEAD' }),
        env: env as never,
        params: { shareId: ['abc12345'] },
        next: async () => buildHtmlResponse(),
      }) as never
    );

    const html = await response.text();
    expect(html).toContain('content="https://studio.test/api/share/abc12345/thumbnail"');
    expect(response.headers.get('x-share-thumbnail')).toBe('true');
    expect(response.headers.get('x-share-twitter-card')).toBe('summary_large_image');
    expect(response.headers.get('x-share-param-type')).toBe('array');
    expect(response.headers.get('x-share-param-raw')).toBe('abc12345');
  });
});
